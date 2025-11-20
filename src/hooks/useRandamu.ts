import { useCallback } from "react";
import { executeOnlySwaps, type Payout } from "../../lib/randamu";

export function useRandamu() {
	const execute = useCallback(async (payouts: Payout[]) => {
		return await executeOnlySwaps(payouts);
	}, []);
	return { executeOnlySwaps: execute };
}


