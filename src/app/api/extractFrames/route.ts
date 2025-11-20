import { NextRequest, NextResponse } from "next/server";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import { promises as fs } from "fs";
import path from "path";
import { tmpdir } from "os";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FRAME_RATE = Number(process.env.EXTRACT_FRAMES_FPS ?? "1");
const MAX_FRAMES = Number(process.env.EXTRACT_FRAMES_MAX ?? "10");

function toDataUri(buffer: Buffer) {
	return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}

async function runFfmpeg(inputPath: string, outputDir: string) {
	return new Promise<void>((resolve, reject) => {
		ffmpeg.setFfmpegPath(ffmpegStatic as string);

		ffmpeg(inputPath)
			.output(path.join(outputDir, "frame_%03d.jpg"))
			.outputOptions(["-vf", `fps=${FRAME_RATE}`])
			.on("end", () => resolve())
			.on("error", (error) => reject(error))
			.run();
	});
}

export async function POST(req: NextRequest) {
	try {
		const formData = await req.formData();
		const videoFile = formData.get("video");

		if (!(videoFile instanceof File)) {
			return NextResponse.json({ error: "video file required" }, { status: 400 });
		}

		const arrayBuffer = await videoFile.arrayBuffer();
		const tempRoot = await fs.mkdtemp(path.join(tmpdir(), "latent-frames-"));
		const inputPath = path.join(tempRoot, videoFile.name || "input.mp4");
		const framesDir = path.join(tempRoot, "frames");

		await fs.writeFile(inputPath, Buffer.from(arrayBuffer));
		await fs.mkdir(framesDir, { recursive: true });

		await runFfmpeg(inputPath, framesDir);

		const files = (await fs.readdir(framesDir))
			.filter((name) => name.toLowerCase().endsWith(".jpg"))
			.sort();

		const limited = files.slice(0, MAX_FRAMES);
		const frames = await Promise.all(
			limited.map(async (name) => {
				const data = await fs.readFile(path.join(framesDir, name));
				return toDataUri(data);
			})
		);

		await fs.rm(tempRoot, { recursive: true, force: true });

		return NextResponse.json({
			frames,
			count: frames.length,
		});
	} catch (error: any) {
		console.error("[extractFrames] error", error);
		return NextResponse.json(
			{ error: error?.message || "Failed to extract frames" },
			{ status: 500 }
		);
	}
}


