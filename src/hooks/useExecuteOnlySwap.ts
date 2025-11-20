import { useCallback } from "react";
import type { Payout } from "../../lib/randamu";

export function useExecuteOnlySwap() {
	const execute = useCallback(async (payouts: Payout[]) => {
		const res = await fetch("/api/payout", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ payouts })
		});
		if (!res.ok) throw new Error(await res.text());
		return await res.json();
	}, []);
	return { execute };
}


