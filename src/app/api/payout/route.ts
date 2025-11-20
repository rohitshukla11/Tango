import { NextRequest, NextResponse } from "next/server";

// In-memory event bus for solver dashboard (non-persistent)
const solverEvents: Array<{
	timestamp: number;
	entryId: string;
	type: "attempt" | "winner";
	solver?: string;
	route?: string;
	priceImpactBps?: number;
}> = [];

export async function GET(req: NextRequest) {
	const url = new URL(req.url);
	if (url.searchParams.get("events")) {
		return NextResponse.json({ events: solverEvents.slice(-200) });
	}
	return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
	try {
		const body = await req.json();
		const { entryId, payouts } = body as {
			entryId?: string;
			payouts?: Array<{ wallet: string; amount: string; chainId: number }>;
		};

		// Simulate solvers competing with mock routes
		const eid = entryId || "0";
		solverEvents.push({ timestamp: Date.now(), entryId: eid, type: "attempt", solver: "solver.A", route: "FIL→USDC→USDC", priceImpactBps: 12 });
		solverEvents.push({ timestamp: Date.now(), entryId: eid, type: "attempt", solver: "solver.B", route: "FIL→USDT→USDC", priceImpactBps: 9 });
		solverEvents.push({ timestamp: Date.now(), entryId: eid, type: "winner", solver: "solver.B", route: "FIL→USDT→USDC", priceImpactBps: 9 });

		// Here you'd call Randamu Only Swaps gateway with the payout vector.
		// For the hack/demo, we just echo back.
		return NextResponse.json({ ok: true, attempted: payouts?.length ?? 0 });
	} catch (e: any) {
		return NextResponse.json({ error: e?.message || "payout failed" }, { status: 500 });
	}
}


