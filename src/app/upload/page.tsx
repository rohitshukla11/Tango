/* eslint-disable @next/next/no-img-element */
"use client";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useWalletClient } from "wagmi";
import { parseEther } from "viem";
import { getFile } from "../../../lib/filecoin";
import { saveUploadedEntry, useEntries, type AIJudgeResult, type Entry } from "@/hooks/useEntries";
import PredictionInput from "@/components/PredictionInput";
import { useScrollPrediction } from "@/hooks/useScrollPrediction";

function toScaledScore(v: number) {
	const clamped = Math.max(0, Math.min(10, v));
	return Math.round(clamped * 100); // 2 decimals
}

const VOTING_WINDOW_SECONDS = Math.max(Number(process.env.NEXT_PUBLIC_VOTING_WINDOW_SECONDS ?? '3600') || 3600, 60)

export default function UploadPage() {
	const [file, setFile] = useState<File | null>(null);
	const [videoCid, setVideoCid] = useState<string>("");
	const [pred, setPred] = useState<string>("");
	const [salt, setSalt] = useState<string>("");
	const [aiMetaCid, setAiMetaCid] = useState<string>("");
	const [aiScore, setAiScore] = useState<number | null>(null);
	const [aiScoreScaled, setAiScoreScaled] = useState<number | null>(null);
	const [aiReasoning, setAiReasoning] = useState<string>("");
	const [aiJudges, setAiJudges] = useState<AIJudgeResult[]>([]);
	const [uploading, setUploading] = useState(false);
	const [uploadCompleted, setUploadCompleted] = useState(false);
	const [judging, setJudging] = useState(false);
	const [preview, setPreview] = useState<string>("");
	const [downloading, setDownloading] = useState(false);
	const [downloadedFileUrl, setDownloadedFileUrl] = useState<string>("");
	const [entryId, setEntryId] = useState<number | undefined>(undefined);
	const [entryCreatedAt, setEntryCreatedAt] = useState<number | undefined>(undefined);
	const [predictionRequestId, setPredictionRequestId] = useState<string>("");
	const { address } = useAccount();
	const { data: walletClient } = useWalletClient();
	const { entries, refreshEntries } = useEntries();
	const { setAIScoreOnChain } = useScrollPrediction();

	// Cleanup blob URLs on unmount
	useEffect(() => {
		return () => {
			if (downloadedFileUrl && downloadedFileUrl.startsWith('blob:')) {
				URL.revokeObjectURL(downloadedFileUrl);
			}
		};
	}, [downloadedFileUrl]);

	const selectedEntry = useMemo(() => {
		if (!entries.length) return undefined;
		if (entryId !== undefined) {
			const match = entries.find((entry) => entry.id === entryId.toString());
			if (match) return match;
		}
		return entries[0];
	}, [entries, entryId]);

	const handleEntrySelect = (event: React.ChangeEvent<HTMLSelectElement>) => {
		const value = event.target.value;
		if (!value) return;
		const numeric = Number(value);
		if (Number.isFinite(numeric)) {
			setEntryId(numeric);
		}
	};

	// Prefill state from the selected entry (latest by default)
	useEffect(() => {
		if (!selectedEntry) return;

		const numericId = Number(selectedEntry.id);
		if (Number.isFinite(numericId) && numericId !== entryId) {
			setEntryId(numericId);
		}

		if (selectedEntry.createdAt && selectedEntry.createdAt !== entryCreatedAt) {
			setEntryCreatedAt(selectedEntry.createdAt);
		}

		if (selectedEntry.cid && selectedEntry.cid !== videoCid) {
			setVideoCid(selectedEntry.cid);
		}

		// Don't auto-load AI scores - only show after clicking judge button
		// AI scores will be set when handleJudge() is called
	}, [selectedEntry, entryId, entryCreatedAt, videoCid]);

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const selectedFile = e.target.files?.[0] || null;
		setFile(selectedFile);
		setUploadCompleted(false); // Reset upload status when new file is selected
		if (selectedFile) {
			setPreview(URL.createObjectURL(selectedFile));
		}
	};

	async function handleUpload() {
		if (!file) return;
		setUploading(true);
		try {
			console.log("[Upload] Starting upload process...");
			console.log("[Upload] File:", file.name, "Size:", file.size);

			// NEW FLOW: Handle Filecoin payment via server-side API using private key
			// User stays on Base network (no network switching required in MetaMask)
			// Server handles all Filecoin Calibration network interactions
			console.log("[Upload] Processing Filecoin payment via server (Base network UI)...");
			
			try {
				// Step 1: Send Base payment via MetaMask (visible to user)
				const basePaymentReceiver = process.env.NEXT_PUBLIC_BASE_PAYMENT_RECEIVER as `0x${string}` | undefined;
				const basePaymentAmount = process.env.NEXT_PUBLIC_BASE_PAYMENT_AMOUNT || "0.01"; // ETH

				if (walletClient && basePaymentReceiver && address) {
					const baseAmountWei = parseEther(basePaymentAmount);
					console.log("[Upload] Sending Base payment:", {
						receiver: basePaymentReceiver,
						amountEth: basePaymentAmount
					});

					await walletClient.sendTransaction({
						account: address as `0x${string}`,
						to: basePaymentReceiver,
						value: baseAmountWei
					});
					console.log("[Upload] Base payment transaction sent.");
				} else {
					console.warn("[Upload] Wallet client or receiver not available. Skipping Base payment.");
				}

				// Step 2: Handle Filecoin payment via server (private key)
				const paymentResponse = await fetch('/api/filecoin-payment', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						baseAmount: process.env.NEXT_PUBLIC_BASE_PAYMENT_AMOUNT || "0.01",
						filecoinAddress: address,
						estimatedSizeBytes: file.size,
						durationDays: 30
					})
				});

				if (!paymentResponse.ok) {
					const errorData = await paymentResponse.json();
					throw new Error(errorData.error || 'Filecoin payment failed');
				}

				const paymentResult = await paymentResponse.json();
				console.log("[Upload] Filecoin payment processed (server-side):", paymentResult);
			} catch (paymentError: any) {
				console.error("[Upload] Filecoin payment failed:", paymentError);
				const errorMsg = paymentError?.message || String(paymentError);
				if (errorMsg.includes("Insufficient")) {
					throw paymentError;
				} else {
					console.warn("[Upload] Payment warning:", paymentError);
				}
			}
			
			// Step 3: Upload file via server API (uses Filecoin private key)
			const formData = new FormData();
			formData.append('file', file);
			formData.append('filename', file.name);

			const uploadResponse = await fetch('/api/filecoin/upload', {
				method: 'POST',
				body: formData
			});

			if (!uploadResponse.ok) {
				const errorData = await uploadResponse.json();
				throw new Error(errorData.error || 'File upload failed');
			}

			const uploadResult = await uploadResponse.json();
			const cid = uploadResult.cid as string;
			console.log("[Upload] Upload successful, CID:", cid);
			
			if (!cid) throw new Error("Missing CID from upload response");
			setVideoCid(cid);
			setUploadCompleted(true);

			// Generate simple timestamp-based ID for localStorage
			const entryId = Math.floor(Date.now() / 1000);
			const createdAt = Date.now();
			setEntryId(entryId);
			setEntryCreatedAt(createdAt);
			
			// Save entry to localStorage immediately
			console.log("[Upload] Saving entry to localStorage...");
			saveUploadedEntry({
				id: entryId.toString(),
				cid: cid,
				creator: address || "0x0",
				status: 'pending',
				createdAt,
				thumbnailUrl: `https://ipfs.io/ipfs/${cid}`,
			});
			refreshEntries();
			console.log("[Upload] Entry saved to Browse section:", entryId);

			try {
				await fetch('/api/arkiv/windows', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						entryId,
						videoCid: cid,
						creator: address || "0x0",
						windowSeconds: VOTING_WINDOW_SECONDS,
						kind: 'voting',
						metadata: {
							createdAt,
						},
					}),
				})
				console.log('[Upload] Voting window registered on Arkiv')
			} catch (arkivError) {
				console.warn('[Upload] Failed to publish Arkiv voting window:', arkivError)
			}

			// Storage payment completed via server-side Filecoin transaction
			// User experience: Paid via Base network, server handled Filecoin payment
			console.log("[Upload] Storage payment completed via Filecoin (server-side with private key)");

			// Prediction is now fully manual via the form.
			// We simply inform the user to continue in the Prediction card.
			console.log("[Upload] Waiting for prediction submission from the form before running AI judge.");
		} catch (error) {
			console.error("[Upload] Error:", error);
		}
		setUploading(false);
	}

	async function handleDownload() {
		if (!videoCid) return;
		
		setDownloading(true);
		
		try {
			console.log("[Download] Starting download for CID:", videoCid);
			const data = await getFile(videoCid);
			
			// Create a blob from the data
			const blob = new Blob([data], { type: "video/mp4" });
			const url = URL.createObjectURL(blob);
			
			// Store the blob URL for viewing in Browse section
			setDownloadedFileUrl(url);
			
			// Create a temporary download link and trigger it
			const a = document.createElement("a");
			a.href = url;
			a.download = file?.name || `video_${videoCid.substring(0, 8)}.mp4`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			
			// Don't revoke URL immediately - keep it for Browse section
			// URL.revokeObjectURL(url); // Commented out to keep file available for viewing
			
			console.log("[Download] Download complete, file available in Browse section");
		} catch (error: any) {
			console.error("[Download] Error:", error);
		}
		
		setDownloading(false);
	}

	async function handleViewInBrowser() {
		if (!videoCid) return;
		
		// Create IPFS gateway URL for direct viewing
		const ipfsUrl = `https://ipfs.io/ipfs/${videoCid}`;
		setDownloadedFileUrl(ipfsUrl);
	}

	async function handleUploadManifest() {
		if (!videoCid) return;
		const manifest = {
			version: 1,
			rules: {
				platformFeeBps: 1000,
				creatorPcts: [60, 40, 20],
				creatorMargins: [0.1, 0.3, 0.5]
			},
			videoCid
		};
		try {
			const res = await fetch("/api/filecoin/upload", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(manifest)
			});
			if (!res.ok) throw new Error(await res.text());
			const data = await res.json();
			const cid = data?.cid as string;
		} catch (e) {
			console.error("[Manifest] Upload failed:", e);
		}
	}

	async function handleCommitLocal() {
		if (!videoCid) {
			alert("Upload video first");
			return;
		}
		const s = salt || crypto.getRandomValues(new Uint32Array(1))[0].toString(16);
		setSalt(s);
		const scoreScaled = toScaledScore(parseFloat(pred || "0"));
	}

	async function handleJudge(targetCid?: string) {
		const cidToJudge = targetCid ?? videoCid;
		if (!cidToJudge || cidToJudge.trim() === "") {
			console.warn("[Judge] No valid CID provided");
			return;
		}
		const judgeUrl =
			typeof window !== "undefined" && window.location?.origin
				? `${window.location.origin}/api/judge`
				: "/api/judge";
		console.log("[Judge] Requesting AI judge for CID:", cidToJudge, "via", judgeUrl);
		setJudging(true);
		setAiJudges([]);
		try {
			const res = await fetch(judgeUrl, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					videoCid: cidToJudge,
					entryId,
					creator: address,
					predictor: address,
				})
			});
			if (!res.ok) {
				console.error("[Judge] Failed:", await res.text());
				return;
			}
		const data = await res.json();
		setAiMetaCid(data?.aiMetaCid || "");
		setAiScore(data?.aiScore ?? null);
		setAiScoreScaled(data?.aiScoreScaled ?? null);
		setAiReasoning(data?.reasoning || "");
		setAiJudges(Array.isArray(data?.judges) ? data.judges : []);

		// Update local entry cache with judge results (preserving prediction data)
		if (entryId && address && cidToJudge && cidToJudge.trim() !== "") {
			console.log("[Judge] Saving entry with AI results for CID:", cidToJudge);
			const aiScoreValue = typeof data?.aiScore === "number" ? data.aiScore : null;
			const aiScoreScaledValue =
				typeof data?.aiScoreScaled === "number"
					? Math.round(data.aiScoreScaled)
					: aiScoreValue !== null
						? Math.round(aiScoreValue * 100)
						: null;

			const entryIdString = entryId.toString();
			const STORAGE_KEY = 'latent_uploaded_entries';

			let existingEntry = entries.find(
				(e) => e.id === entryIdString || e.cid === cidToJudge
			);

			if (!existingEntry || !existingEntry.predictionResult) {
				try {
					const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
					if (raw) {
						const storedEntries: Entry[] = JSON.parse(raw);
						const fallbackEntry = storedEntries.find(
							(e) => e.id === entryIdString || e.cid === cidToJudge
						);
						if (fallbackEntry) {
							existingEntry = fallbackEntry;
						}
					}
				} catch (err) {
					console.warn('[Judge] Failed to read entries from localStorage:', err);
				}
			}

			const updatedEntry: Entry = {
				id: entryIdString,
				cid: cidToJudge,
				creator: address,
				status: 'judged',
				aiScore: data?.aiScore ?? existingEntry?.aiScore,
				aiJudges: Array.isArray(data?.judges) ? data.judges : existingEntry?.aiJudges,
				audienceScore: existingEntry?.audienceScore,
				createdAt: existingEntry?.createdAt ?? entryCreatedAt ?? Date.now(),
				predictionResult: existingEntry?.predictionResult,
				thumbnailUrl: existingEntry?.thumbnailUrl ?? `https://ipfs.io/ipfs/${cidToJudge}`,
			};

			saveUploadedEntry(updatedEntry);
			refreshEntries();

			if (aiScoreScaledValue && aiScoreScaledValue > 0) {
				try {
					console.log("[Judge] Publishing AI score on-chain:", {
						entryId,
						aiScoreScaledValue,
					});
					await setAIScoreOnChain(entryId, aiScoreScaledValue);
				} catch (chainError) {
					console.error("[Judge] Failed to set AI score on-chain:", chainError);
				}
			} else {
				console.warn("[Judge] Skipping on-chain AI score update - invalid score:", aiScoreScaledValue);
			}
		}
		} catch (error) {
			console.error("[Judge] Error:", error);
		} finally {
			setJudging(false);
		}
	}

	return (
		<div className="min-h-screen bg-brutal-cream">
			{/* Header - Neo-Brutalism Style */}
			<header className="sticky top-0 z-50 bg-argentina-blue border-b-4 border-brutal-black shadow-brutal">
				<div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 sm:py-5">
					<div className="flex items-center justify-between">
						<Link href="/" className="text-2xl sm:text-3xl md:text-4xl font-black text-brutal-black tracking-tighter transform -rotate-1">
							TANGO<span className="text-argentina-yellow">.FUN</span>
						</Link>
						<div className="flex items-center gap-2 sm:gap-3">
							<Link
								href="/"
								className="brutal-btn px-3 py-2 sm:px-6 sm:py-3 text-xs sm:text-base"
							>
								<span className="hidden sm:inline">← HOME</span>
								<span className="sm:hidden">←</span>
							</Link>
							<div className="wallet-connect-wrapper">
								<ConnectButton />
							</div>
						</div>
					</div>
				</div>
			</header>

			<main className="max-w-6xl mx-auto px-3 sm:px-4 py-6 sm:py-8">
				{/* Page Title */}
				<div className="text-center mb-6 sm:mb-8">
					<h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-brutal-black mb-3 sm:mb-4 transform rotate-1">
						UPLOAD YOUR TALENT 🎭
					</h1>
					<p className="text-base sm:text-lg font-bold text-brutal-black/70">
						Showcase your skills and get AI-judged!
					</p>
				</div>

				<div className="grid lg:grid-cols-2 gap-4 sm:gap-6">
					{/* Left Column - Upload */}
					<div className="space-y-4 sm:space-y-6">
						{/* Video Upload Card */}
						<div className="feed-card p-4 sm:p-6 space-y-4 sm:space-y-6">
							<div className="flex items-center gap-3 border-b-4 border-brutal-black pb-3">
								<div className="w-12 h-12 sm:w-16 sm:h-16 bg-argentina-blue border-4 border-brutal-black flex items-center justify-center transform -rotate-3">
									<svg className="w-6 h-6 sm:w-8 sm:h-8 text-brutal-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
									</svg>
								</div>
								<h2 className="text-xl sm:text-2xl font-black text-brutal-black uppercase">Upload Video</h2>
							</div>

							{/* File Input */}
							<div className="relative">
								<input
									type="file"
									accept="video/*"
									onChange={handleFileChange}
									className="hidden"
									id="video-upload"
								/>
								<label
									htmlFor="video-upload"
									className="flex flex-col items-center justify-center w-full h-48 sm:h-64 border-4 border-dashed border-brutal-black bg-brutal-white cursor-pointer hover:bg-argentina-blue/10 transition-all brutal-card"
								>
									{preview ? (
										<video src={preview} className="w-full h-full object-cover" controls />
									) : (
										<>
											<svg className="w-12 h-12 sm:w-16 sm:h-16 text-brutal-black mb-3 transform rotate-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
											</svg>
											<p className="text-sm sm:text-base font-black text-brutal-black uppercase">Click to Select</p>
											<p className="text-xs sm:text-sm font-bold text-brutal-black/60 mt-1">MP4, WebM, or OGG (MAX. 100MB)</p>
										</>
									)}
								</label>
							</div>

							{file && (
								<div className="brutal-card p-3 sm:p-4 space-y-2">
									<p className="text-xs sm:text-sm font-black text-brutal-black">
										Selected: <span className="text-argentina-blue">{file.name}</span>
									</p>
									<p className="text-xs sm:text-sm font-black text-brutal-black">
										Size: <span className="text-argentina-blue">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
									</p>
								</div>
							)}

							<button
								onClick={handleUpload}
								disabled={!file || uploading || uploadCompleted}
								className={`w-full px-6 py-4 text-base sm:text-lg disabled:cursor-not-allowed ${
									uploadCompleted 
										? 'brutal-btn bg-green-400 border-4 border-brutal-black text-brutal-black' 
										: 'brutal-btn-blue disabled:opacity-50'
								}`}
							>
								{uploading 
									? '⏳ UPLOADING...' 
									: uploadCompleted 
										? '✅ VIDEO UPLOADED' 
										: '🚀 UPLOAD VIDEO'}
							</button>
						</div>
					</div>

					{/* Right Column - Prediction & AI Judge */}
					<div className="space-y-4 sm:space-y-6">
						{/* Prediction Card */}
						{videoCid && (
							<div className="feed-card p-4 sm:p-6 space-y-4 sm:space-y-6">
								<div className="flex items-center gap-3 border-b-4 border-brutal-black pb-3">
									<div className="w-12 h-12 sm:w-16 sm:h-16 bg-argentina-blue border-4 border-brutal-black flex items-center justify-center transform rotate-3">
										<span className="text-2xl sm:text-3xl">🔐</span>
									</div>
									<h2 className="text-xl sm:text-2xl font-black text-brutal-black uppercase">Prediction</h2>
								</div>
								
								<p className="text-sm sm:text-base font-bold text-brutal-black/70">
									Predict your AI score and commit it on Scroll!
								</p>

								<PredictionInput
									entryId={entryId ?? (selectedEntry ? Number(selectedEntry.id) : undefined)}
									videoCid={videoCid}
									onPredictionSubmitted={async (requestId, unlockBlock) => {
										setPredictionRequestId(requestId);
										console.log(`[Scroll] Prediction submitted - Request ID: ${requestId}, Unlock Block: ${unlockBlock}`);
										
										// Run AI judge after manual prediction submission (if not already judged)
										if (videoCid && videoCid.trim() !== "" && !aiScore) {
											console.log('[Scroll] Running AI judge after manual prediction submission...');
											await handleJudge(videoCid);
										}
									}}
								/>
							</div>
						)}

						{/* AI Judge Card */}
						<div className="feed-card p-4 sm:p-6 space-y-4 sm:space-y-6">
							<div className="flex items-center gap-3 border-b-4 border-brutal-black pb-3">
								<div className="w-12 h-12 sm:w-16 sm:h-16 bg-argentina-yellow border-4 border-brutal-black flex items-center justify-center transform rotate-3">
									<svg className="w-6 h-6 sm:w-8 sm:h-8 text-brutal-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
									</svg>
								</div>
								<h2 className="text-xl sm:text-2xl font-black text-brutal-black uppercase">AI Judge</h2>
							</div>

							<p className="text-sm sm:text-base font-bold text-brutal-black/70">
								Let our AI judges score and roast your performance!
							</p>

							<button
								onClick={() => {
									if (!videoCid || videoCid.trim() === "") {
										console.warn("[Judge] Cannot judge: no valid CID");
										return;
									}
									handleJudge();
								}}
								disabled={!videoCid || judging}
								className="w-full brutal-btn-blue px-6 py-4 text-base sm:text-lg disabled:opacity-50 disabled:cursor-not-allowed"
							>
								{judging ? '⏳ JUDGING...' : '🤖 RUN AI JUDGE'}
							</button>

							{/* AI Score Display - Only shows after clicking judge */}
							{aiScore !== null && (
								<div className="space-y-4">
									{/* Large Score Display */}
									<div className="brutal-card-blue p-4 sm:p-6 text-center">
										<p className="text-xs sm:text-sm font-black text-brutal-black mb-2 uppercase">AI Score</p>
										<div className="text-5xl sm:text-6xl font-black text-brutal-black mb-2 transform -rotate-2">
											{aiScore}
											<span className="text-2xl sm:text-3xl text-brutal-black/60">/10</span>
										</div>
										<p className="text-xs sm:text-sm font-bold text-brutal-black/80">
											Scaled: {aiScoreScaled}
										</p>
									</div>

									{/* Judges Breakdown */}
									{aiJudges.length > 0 && (
										<div className="space-y-3">
											<p className="text-xs sm:text-sm font-black text-brutal-black uppercase">🎭 Judge Panel</p>
											<div className="space-y-2 sm:space-y-3">
												{aiJudges.map((judge, idx) => (
													<div
														key={judge.name}
														className={`brutal-card p-3 sm:p-4 transform ${idx % 2 === 0 ? 'rotate-1' : '-rotate-1'}`}
													>
														<div className="flex items-center justify-between mb-2">
															<div className="flex-1 min-w-0">
																<p className="text-sm sm:text-base font-black text-brutal-black truncate">{judge.name}</p>
																<p className="text-xs font-bold text-brutal-black/70 truncate">{judge.persona}</p>
															</div>
															<span className="text-xl sm:text-2xl font-black text-brutal-black ml-2">{judge.score.toFixed(1)}</span>
														</div>
														<p className="text-xs sm:text-sm font-medium text-brutal-black/80">{judge.comment}</p>
													</div>
												))}
											</div>
										</div>
									)}


									{/* Metadata CID */}
									{aiMetaCid && (
										<div className="brutal-card p-3 sm:p-4">
											<p className="text-xs font-black text-brutal-black mb-1 uppercase">AI Metadata CID</p>
											<code className="text-xs font-mono font-bold text-brutal-black/60 break-all">{aiMetaCid}</code>
										</div>
									)}
								</div>
							)}
						</div>
					</div>
				</div>

			</main>
		</div>
	);
}

