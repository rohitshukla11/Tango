import { estimateStorageCost, payForStorage, getPlatformStorageBalance } from "../../lib/filecoin";
import { onlySwaps } from "../../lib/randamu";

export type AutoPayLogFn = (line: string) => void;

export function useAutoPay() {
	async function ensureStoragePayment(cid: string, log?: AutoPayLogFn) {
		const logger = (msg: string) => {
			console.log(msg);
			if (log) log(msg);
		};

		logger(`[agent] estimating storage cost for ${cid} ...`);
		const estimate = await estimateStorageCost(cid);
		logger(`[agent] storage cost = ${estimate.amount} ${estimate.token}`);

		const token = estimate.token || "USDC";

		// Demo platform wallet address target (frontend-safe env)
		const receiver = (process.env.NEXT_PUBLIC_PLATFORM_TREASURY || "").trim() as `0x${string}`;

		const balance = await getPlatformStorageBalance(token);
		logger(`[agent] balance = ${balance} ${token}`);

		if (balance < estimate.amount) {
			const deficit = Number((estimate.amount - balance).toFixed(6));
			logger(`[agent] insufficient balance → calling Randamu Only Swaps for ${deficit} ${token}`);
			logger(`[randamu] finding solver routes...`);
			await onlySwaps({
				fromChain: "polygon",
				toChain: "filecoin",
				tokenIn: "ETH",
				tokenOut: token,
				amount: deficit,
				receiver
			});
			logger(`[randamu] swap executed → ${token} received`);
		}

		logger(`[filecoin] paying storage for CID: ${cid}`);
		await payForStorage({ cid, amount: estimate.amount, token });
		logger(`[filecoin] storage paid for CID: ${cid}`);
	}

	return { ensureStoragePayment };
}


