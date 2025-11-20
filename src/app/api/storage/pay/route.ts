import { NextRequest, NextResponse } from "next/server";
import { payForStorage } from "../../../../../lib/filecoin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
	try {
		const { cid, amount, token } = await req.json();
		if (!cid || typeof cid !== "string") {
			return NextResponse.json({ error: "cid required" }, { status: 400 });
		}
		if (typeof amount !== "number" || !token) {
			return NextResponse.json({ error: "amount and token required" }, { status: 400 });
		}
		// Requires server signer via FILECOIN_PRIVATE_KEY to call Synapse PaymentsService
		if (!process.env.FILECOIN_PRIVATE_KEY) {
			return NextResponse.json(
				{ error: "Server signer not configured. Set FILECOIN_PRIVATE_KEY in .env.local" },
				{ status: 400 }
			);
		}
		const r = await payForStorage({ cid, amount, token });
		return NextResponse.json({ ok: true, txId: r.txId });
	} catch (e: any) {
		const msg = e?.cause?.message || e?.message || "pay failed";
		return NextResponse.json({ error: msg }, { status: 500 });
	}
}


