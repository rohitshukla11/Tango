export type Payout = {
	wallet: `0x${string}`;
	amount: string; // wei as decimal string
	chainId: number;
};

export type OnlySwapParams = {
	fromChain: string;
	toChain: string;
	tokenIn: string;   // e.g., ETH
	tokenOut: string;  // e.g., USDC
	amount: number;    // human-readable (e.g., 0.32)
	receiver: `0x${string}`;
};

// Build typed data for EIP-712 PrizeRelease used by PrizePayout
export function buildPrizeReleaseTypedData(params: {
	chainId: number;
	verifyingContract: `0x${string}`;
	entryId: bigint;
	finalScoreScaled: number; // uint16
}) {
	const { chainId, verifyingContract, entryId, finalScoreScaled } = params;
	return {
		domain: {
			name: "Latent.fun",
			version: "1",
			chainId,
			verifyingContract
		},
		types: {
			PrizeRelease: [
				{ name: "entryId", type: "uint256" },
				{ name: "finalScore", type: "uint16" },
				{ name: "contest", type: "address" }
			]
		},
		primaryType: "PrizeRelease" as const,
		message: {
			entryId,
			finalScore: finalScoreScaled,
			// the contract expects 'contest' be address(contest) but the struct is hashed inside PrizePayout with contest address stored there.
			// to stay compatible with the solidity hashing, we include the same verifying contract for both fields on the client side,
			// though only entryId and finalScore are actually needed for user UX; the contract re-computes 'contest' internally.
			contest: verifyingContract
		}
	};
}

// Execute Only Swaps via backend route which will call Randamu solver network.
export async function executeOnlySwaps(payouts: Payout[]) {
	const res = await fetch("/api/payout", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ payouts })
	});
	if (!res.ok) {
		throw new Error(`OnlySwaps failed: ${res.status} ${await res.text()}`);
	}
	return await res.json();
}

// Simple Only Swaps agent entry-point for storage top-ups
export async function onlySwaps(params: OnlySwapParams) {
	console.log("[randamu] requesting only swap", params);
	const res = await fetch("/api/payout", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			entryId: "storage-topup",
			payouts: [
				{ wallet: params.receiver, amount: String(params.amount), chainId: 314159 } // Filecoin Calibration id
			]
		})
	});
	if (!res.ok) {
		throw new Error(`OnlySwaps (agent) failed: ${res.status} ${await res.text()}`);
	}
	return await res.json();
}

// Conditional signature helper (EIP-712) - generic signer via window.ethereum
export async function conditionalSign(typedData: any): Promise<`0x${string}`> {
	// @ts-ignore - dapp wallets inject this
	const [account] = await window.ethereum.request({ method: "eth_requestAccounts" });
	// @ts-ignore
	const sig: `0x${string}` = await window.ethereum.request({
		method: "eth_signTypedData_v4",
		params: [account, JSON.stringify(typedData)]
	});
	return sig;
}

export function toPayoutVector(inputs: Array<{ wallet: string; amountWei: bigint; chainId?: number }>): Payout[] {
	return inputs.map(i => ({
		wallet: i.wallet as `0x${string}`,
		amount: i.amountWei.toString(10),
		chainId: i.chainId ?? Number(globalThis?.ethereum?.chainId ?? 0)
	}));
}


