import { NextRequest, NextResponse } from "next/server";
// Use dynamic import to keep Synapse SDK server-only

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
	const contentType = req.headers.get("content-type") || "";
	try {
		if (contentType.includes("multipart/form-data")) {
			const formData = await req.formData();
			const file = formData.get("file");
			if (!file || typeof file === "string") {
				return NextResponse.json({ error: "file missing" }, { status: 400 });
			}
			// Upload via Synapse SDK wrapper (dynamic import to avoid bundling Synapse SDK into build)
			// Note: Storage payment is already handled via /api/filecoin-payment
			// No need to call payForStorage here - setupPayments() already deposited and approved funds
			const { uploadFile: synapseUploadFile } = await import("../../../../../lib/filecoin");
			const cid = await synapseUploadFile(file as unknown as Blob);
			const size = (file as File).size || 0;
			return NextResponse.json({ cid, bytes: size });
		} else {
			const body = await req.json();
			const { uploadJSON: synapseUploadJSON } = await import("../../../../../lib/filecoin");
			const cid = await synapseUploadJSON(body);
			const bytes = JSON.stringify(body).length;
			// Note: Storage payment is already handled via /api/filecoin-payment
			return NextResponse.json({ cid, bytes });
		}
	} catch (e: any) {
		// Normalize common network errors
		const msg = e?.cause?.message || e?.message || "upload failed";
		const hint =
			msg.includes("getaddrinfo ENOTFOUND") || msg.includes("fetch failed")
				? "Check FILECOIN_RPC_URL connectivity and FILECOIN_PRIVATE_KEY. See SYNAPSE_SETUP.md."
				: undefined;
		return NextResponse.json({ error: msg, hint }, { status: 500 });
	}
}


