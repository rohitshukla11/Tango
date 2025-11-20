import { NextRequest, NextResponse } from "next/server";
import { getFile } from "../../../../lib/filecoin";
import { publishScoreEvent } from "../../../../lib/arkiv";
import { Buffer } from "node:buffer";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import fs from "fs";
import { promises as fsp } from "fs";
import path from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

type JudgeTemplate = {
	name: string;
	persona: string;
	style: string;
};

type JudgeResult = {
	name: string;
	persona: string;
	score: number;
	comment: string;
};

type AnalysisResult = {
	score: number;
	reasoning: string;
	fileSizeMB: number;
	entropy: number;
	factors: string[];
	cidHash: number;
};

const JUDGE_TEMPLATES: JudgeTemplate[] = [
	{
		name: "Professor Patrick",
		persona: "hyperactive cybercomedian who roasts with affection",
		style: "chaotic good, rapid-fire observations, lots of memes"
	},
	{
		name: "Sophisticate Sarah",
		persona: "pretentious music theorist who overanalyzes everything",
		style: "verbose academic jargon mixed with dad jokes"
	},
	{
		name: "Sergeant Nick",
		persona: "battle-hardened talent show drill sergeant who always declares 'That's the Nick Way!' in every verdict",
		style: "tough love, motivational insults, heart of gold"
	}
];

const OPENAI_MODEL = process.env.OPENAI_JUDGE_MODEL || "gpt-4o";
const FRAME_TARGET = Math.min(Math.max(parseInt(process.env.AI_JUDGE_FRAME_COUNT ?? "3", 10), 1), 5);
const FRAME_FPS = Math.max(0.25, Number(process.env.AI_JUDGE_FRAME_FPS ?? "0.5"));

type JudgePanelResult = {
	judges: JudgeResult[];
	overallComment?: string;
	overallScore?: number;
};

async function extractVideoFrames(videoData: Uint8Array, frameCount = FRAME_TARGET): Promise<string[]> {
	const tempRoot = await fsp.mkdtemp(path.join(tmpdir(), "latent-judge-"));
	const inputPath = path.join(tempRoot, `video-${randomUUID()}.mp4`);
	const framesDir = path.join(tempRoot, "frames");

	try {
		await fsp.writeFile(inputPath, videoData);
		await fsp.mkdir(framesDir, { recursive: true });

		const candidatePaths: (string | undefined)[] = [
			typeof ffmpegStatic === "string"
				? ffmpegStatic
				: (ffmpegStatic as unknown as { path?: string })?.path,
			process.env.FFMPEG_PATH,
			path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg"),
			path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg.exe"),
		];

		const ffmpegPath = candidatePaths.find((p) => p && fs.existsSync(p));

		if (!ffmpegPath) {
			throw new Error(
				"Unable to resolve ffmpeg binary path. Set FFMPEG_PATH env or install ffmpeg-static correctly."
			);
		}

		console.log(`[AI Judge] Using ffmpeg binary at ${ffmpegPath}`);

		ffmpeg.setFfmpegPath(ffmpegPath);

		await new Promise<void>((resolve, reject) => {
			ffmpeg(inputPath)
				.output(path.join(framesDir, "frame_%03d.jpg"))
				.outputOptions(["-vf", `fps=${FRAME_FPS}`])
				.on("end", () => resolve())
				.on("error", (err: Error) => reject(err))
				.run();
		});

		const entries = (await fsp.readdir(framesDir))
			.filter((name) => name.toLowerCase().endsWith(".jpg"))
			.sort()
			.slice(0, frameCount);

		const frames = await Promise.all(
			entries.map(async (name) => {
				const data = await fsp.readFile(path.join(framesDir, name));
				return data.toString("base64");
			})
		);

		console.log(`[AI Judge] Extracted ${frames.length} frame(s) for analysis via FFmpeg.`);
		return frames;
	} catch (error) {
		console.warn("[AI Judge] extractVideoFrames failed:", error);
		return [];
	} finally {
		await fsp.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
	}
}

// Analyze video data and return a score
async function analyzeVideo(videoData: Uint8Array, cid: string): Promise<AnalysisResult> {
	// Basic video analysis based on file characteristics
	const fileSize = videoData.length;
	const fileSizeMB = fileSize / (1024 * 1024);
	
	console.log(`[AI Judge] Video size: ${fileSizeMB.toFixed(2)} MB`);
	
	// Score based on video characteristics
	let score = 5.0; // Base score
	const factors: string[] = [];
	
	// Size analysis (optimal range: 1-50 MB)
	if (fileSizeMB >= 1 && fileSizeMB <= 10) {
		score += 2.0;
		factors.push("optimal file size");
	} else if (fileSizeMB > 10 && fileSizeMB <= 50) {
		score += 1.5;
		factors.push("good file size");
	} else if (fileSizeMB > 50) {
		score += 1.0;
		factors.push("large file");
	} else {
		score += 0.5;
		factors.push("small file");
	}
	
	// CID-based quality estimation (deterministic but varied)
	const cidHash = Array.from(new TextEncoder().encode(cid)).reduce((a, c) => (a * 131 + c) % 1000003, 7);
	const cidBonus = (cidHash % 300) / 100; // 0.00 to 3.00
	score += cidBonus;
	
	// Data entropy check (measure of complexity)
	const entropy = calculateEntropy(videoData.slice(0, Math.min(10000, videoData.length)));
	if (entropy > 7.5) {
		score += 0.5;
		factors.push("high complexity");
	} else if (entropy > 6.0) {
		factors.push("good complexity");
	}
	
	// Normalize score to 1-10 range
	score = Math.max(1, Math.min(10, score));
	score = Math.round(score * 10) / 10; // Round to 1 decimal
	
	// Generate reasoning
	let reasoning = "";
	if (score >= 8.5) {
		reasoning = `Outstanding! ${factors.join(", ")}. Exceptional quality and presentation.`;
	} else if (score >= 7.0) {
		reasoning = `Great work! ${factors.join(", ")}. Strong performance with professional touch.`;
	} else if (score >= 5.5) {
		reasoning = `Good effort! ${factors.join(", ")}. Solid performance with room to grow.`;
	} else if (score >= 4.0) {
		reasoning = `Decent attempt. ${factors.join(", ")}. Keep practicing!`;
	} else {
		reasoning = `Needs improvement. ${factors.join(", ")}. Focus on quality.`;
	}
	
	return { score, reasoning, fileSizeMB, entropy, factors, cidHash };
}

// Calculate Shannon entropy of data (measure of randomness/complexity)
function calculateEntropy(data: Uint8Array): number {
	const freq: { [key: number]: number } = {};
	for (const byte of data) {
		freq[byte] = (freq[byte] || 0) + 1;
	}
	
	let entropy = 0;
	const len = data.length;
	for (const count of Object.values(freq)) {
		const p = count / len;
		entropy -= p * Math.log2(p);
	}
	
	return entropy;
}

function pseudoRandom(seed: number) {
	let value = seed % 2147483647;
	if (value <= 0) value += 2147483646;
	return () => {
		value = (value * 16807) % 2147483647;
		return (value - 1) / 2147483646;
	};
}

function buildFallbackJudges(analysis: AnalysisResult): JudgeResult[] {
	const personaExtras: Record<string, { opener: string; closer: string[] }> = {
		"Professor Patrick": {
			opener: "Glitchy short-circuits with laughter",
			closer: [
				"and sprays confetti pixels everywhere.",
				"after spotting a meme-worthy move.",
				"while riffing about the neon chaos."
			]
		},
		"Sophisticate Sarah": {
			opener: "Professor adjusts their monocle",
			closer: [
				"and cites an obscure harmony theorem.",
				"before diagramming the cadence in chalk.",
				"while assigning bonus points for phrasing."
			]
		},
		"Sergeant Nick": {
			opener: "Sergeant barks a verdict",
			closer: [
				"but lets a grin slip through the salute. That's the Nick Way!",
				"then orders the audience to drop and cheer. That's the Nick Way!",
				"and stamps approval on the talent dossier. That's the Nick Way!"
			]
		}
	};

	return JUDGE_TEMPLATES.map((template, index) => {
		const rng = pseudoRandom(analysis.cidHash + (index + 1) * 1337);
		const jitter = (rng() - 0.5) * 1.6; // +/- 0.8 range
		const rawScore = Math.max(1, Math.min(10, Math.round((analysis.score + jitter) * 10) / 10));
		
		const toneModifiers: string[] = [];
		if (analysis.fileSizeMB < 2) toneModifiers.push("micro-dose of file size");
		if (analysis.fileSizeMB > 25) toneModifiers.push("chonky upload energy");
		if (analysis.entropy > 7) toneModifiers.push("spicy entropy sparkle");
		if (analysis.entropy < 5) toneModifiers.push("smooth-brain codec vibes");
		const personaDetail = personaExtras[template.name] ?? {
			opener: `${template.name} locks in`,
			closer: ["with signature flair."]
		};
		const closer = personaDetail.closer[Math.floor(rng() * personaDetail.closer.length)];
		const comment = `${personaDetail.opener} after noting ${toneModifiers.join(", ") || "a surprisingly balanced upload"}, delivers a ${rawScore}/10 ${closer}`;
		
		return {
			name: template.name,
			persona: template.persona,
			score: rawScore,
			comment
		};
	});
}

async function generateJudgePanel(
	analysis: AnalysisResult,
	videoCid: string,
	videoFrames: string[]
): Promise<JudgePanelResult> {
	const apiKey = process.env.OPENAI_API_KEY;
	if (!apiKey) {
		console.warn("[AI Judge] OPENAI_API_KEY missing. Using fallback judges.");
		return { judges: buildFallbackJudges(analysis) };
	}

	if (!videoFrames.length) {
		console.warn("[AI Judge] No frames available for visual analysis. Using fallback judges.");
		return { judges: buildFallbackJudges(analysis) };
	}
	
	try {
		const personas = JUDGE_TEMPLATES.map((jt) => `- ${jt.name}: ${jt.persona}. Style: ${jt.style}`).join("\n");
		const metadataText = [
			`Video CID: ${videoCid}`,
			`Estimated file size: ${analysis.fileSizeMB.toFixed(2)} MB`,
			`Byte entropy sample: ${analysis.entropy.toFixed(2)}`,
			`Heuristic factors: ${analysis.factors.join(", ") || "none"}`,
			`Extracted frames: ${videoFrames.length}`
		].join("\n");

		const response = await fetch("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Authorization": `Bearer ${apiKey}`
			},
			body: JSON.stringify({
				model: OPENAI_MODEL,
				temperature: 0.4,
				response_format: {
					type: "json_schema",
					json_schema: {
						name: "judge_panel",
						schema: {
							type: "object",
							additionalProperties: false,
							required: ["overall_comment", "overall_score", "judges"],
							properties: {
								overall_comment: { type: "string" },
								overall_score: { type: "number" },
								judges: {
									type: "array",
									minItems: 3,
									items: {
										type: "object",
										additionalProperties: false,
										required: ["name", "persona", "score", "comment"],
										properties: {
											name: { type: "string" },
											persona: { type: "string" },
											score: { type: "number" },
											comment: { type: "string" }
										}
									}
								}
							}
						}
					}
				},
				messages: [
					{
						role: "system",
						content: [
							{
								type: "text",
								text: `You orchestrate three eccentric AI judges. Each judge must keep their assigned persona, critique the performance using the video frames, and deliver a UNIQUE perspective. Never reuse wording between judges; highlight different details (camera movement, expressions, choreography, mood, etc.).`
							},
							{
								type: "text",
								text: `Judges & personalities:\n${personas}`
							}
						]
					},
					{
						role: "user",
						content: [
							{
								type: "text",
								text: `Analyze the performance using these frames and return JSON with fields "overall_comment", "overall_score", and "judges". Scores range 0-10 with one decimal. Mention specific visual details you observe (e.g., wardrobe color, background, lighting, expressions). Do not repeat phrases across judges.\n${metadataText}`
							},
							...videoFrames.map((frame) => ({
								type: "image_url",
								image_url: {
									url: `data:image/jpeg;base64,${frame}`
								}
							}))
						]
					}
				]
			})
		});
		
		if (!response.ok) {
			const errorText = await response.text();
			console.warn("[AI Judge] OpenAI request failed:", response.status, errorText);
			return { judges: buildFallbackJudges(analysis) };
		}
		
		const data = await response.json();
		const message = data?.choices?.[0]?.message;
		const messageContent = message?.content;

		let parsed: { judges?: JudgeResult[]; overall_comment?: string; overall_score?: number } | null = null;

		if (typeof messageContent === "string") {
			try {
				parsed = JSON.parse(messageContent);
			} catch (err) {
				console.warn("[AI Judge] Unable to parse string content from OpenAI.", err, messageContent);
			}
		} else if (Array.isArray(messageContent)) {
			for (const part of messageContent) {
				if (part?.type === "json_schema" && part?.json) {
					parsed = part.json as typeof parsed;
					break;
				}
				if (part?.type === "text" && typeof part?.text === "string") {
					try {
						parsed = JSON.parse(part.text);
						break;
					} catch (err) {
						continue;
					}
				}
			}
		}

		if (!parsed) {
			console.warn("[AI Judge] OpenAI response missing JSON payload. Falling back.", JSON.stringify(message));
			return { judges: buildFallbackJudges(analysis) };
		}
		
		const judges = Array.isArray(parsed?.judges) ? parsed.judges : [];
		const normalizedJudges = judges.map((judge, idx) => ({
			name: judge.name || JUDGE_TEMPLATES[idx % JUDGE_TEMPLATES.length].name,
			persona: judge.persona || JUDGE_TEMPLATES[idx % JUDGE_TEMPLATES.length].persona,
			score: typeof judge.score === "number" ? Math.max(0, Math.min(10, judge.score)) : analysis.score,
			comment: judge.comment || `${JUDGE_TEMPLATES[idx % JUDGE_TEMPLATES.length].name} approves this message.`
		}));

		if (normalizedJudges.length < 3) {
			while (normalizedJudges.length < 3) {
				const template = JUDGE_TEMPLATES[normalizedJudges.length];
				normalizedJudges.push({
					name: template.name,
					persona: template.persona,
					score: analysis.score,
					comment: `${template.name} approves this message.`
				});
			}
		}

		return {
			judges: normalizedJudges,
			overallComment: parsed?.overall_comment,
			overallScore: typeof parsed?.overall_score === "number" ? Math.max(0, Math.min(10, parsed?.overall_score)) : undefined
		};
	} catch (error) {
		console.warn("[AI Judge] OpenAI request error. Using fallback judges.", error);
		return { judges: buildFallbackJudges(analysis) };
	}
}

export async function POST(req: NextRequest) {
	try {
		const { videoCid, entryId, creator, predictor } = await req.json();
		if (!videoCid) {
			return NextResponse.json({ error: "videoCid required" }, { status: 400 });
		}
		
		console.time(`[AI Judge] total`);
		console.log(`[AI Judge] Start request for CID ${videoCid}`);
		
		console.log(`[AI Judge] Fetching video from Synapse/IPFS: ${videoCid}`);
		
		// Fetch video from Synapse/IPFS
		const videoBuffer = await getFile(videoCid);
		const videoData = new Uint8Array(videoBuffer);
		console.log(`[AI Judge] Video fetched: ${videoData.length} bytes`);
		
		// Analyze video
		const analysis = await analyzeVideo(videoData, videoCid);
		console.log(`[AI Judge] Analysis complete. Score: ${analysis.score}, entropy: ${analysis.entropy.toFixed(2)}`);

		const frames = await extractVideoFrames(videoData);
		console.log(`[AI Judge] Extracted ${frames.length} frame(s) for judge panel`);

		const panel = await generateJudgePanel(analysis, videoCid, frames);
		console.log(`[AI Judge] Judge panel ready. Judges: ${panel.judges?.length ?? 0}`);

		const judges = panel.judges;
		
		const combinedScore =
			panel.overallScore ??
			(judges.reduce((sum, judge) => sum + judge.score, 0) / Math.max(judges.length, 1) || analysis.score);
		const averagedScore = Math.round(combinedScore * 10) / 10;
		const aiScoreScaled = Math.round(averagedScore * 100); // Scale to 0-1000
		
		const panelSummary = `Average from ${judges.length} judges (${judges
			.map((j) => `${j.name}: ${j.score}`)
			.join(", ")}).`;
		
		console.log(`[AI Judge] Judges: ${panelSummary}`);
		const reasoningParts = [analysis.reasoning];
		if (panel.overallComment) {
			reasoningParts.push(panel.overallComment);
		}
		const reasoning = reasoningParts.join(" ");
		
		const payload = { 
			aiScore: averagedScore, 
			aiScoreScaled, 
			aiMetaCid: "", // No metadata upload needed
			reasoning: `${reasoning} ${panelSummary}`,
			timestamp: Date.now(),
			judges
		};

		publishScoreEvent({
			entryId: entryId ? String(entryId) : videoCid,
			videoCid,
			aiScore: averagedScore,
			aiScoreScaled,
			judges,
			reasoning: payload.reasoning,
			creator: creator ?? predictor ?? 'unknown',
			status: 'judged',
			metadata: {
				panelSummary,
				predictor: predictor ?? null,
			},
		}).catch((error) => {
			console.warn('[AI Judge] Failed to push Arkiv score entity:', error)
		})

		console.log(`[AI Judge] Returning payload:`, payload);
		console.timeEnd(`[AI Judge] total`);
		return NextResponse.json(payload);
	} catch (e: any) {
		console.error("[AI Judge] Error:", e);
		return NextResponse.json({ 
			error: e?.message || "AI judging failed",
			details: e?.stack || ""
		}, { status: 500 });
	}
}
