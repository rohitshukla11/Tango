#!/usr/bin/env ts-node
/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { filecoinCalibration } from "viem/chains";

function requireEnv(name: string) {
	const v = process.env[name];
	if (!v) throw new Error(`Missing env ${name}`);
	return v;
}

const abi = [
	{ "type":"function","name":"setAIScore","stateMutability":"nonpayable","inputs":[{"name":"entryId","type":"uint256"},{"name":"aiScoreScaled","type":"uint16"}],"outputs":[] }
];

function toScaled(score: number) {
	return Math.round(Math.max(0, Math.min(10, score)) * 100);
}

async function main() {
	const RPC = process.env.FILECOIN_RPC_URL || "https://api.calibration.node.glif.io/rpc/v1";
	const PK = requireEnv("FILECOIN_PRIVATE_KEY");
	const entryId = BigInt(requireEnv("ENTRY_ID"));
	const aiScoreRaw = requireEnv("AI_SCORE"); // accepts "7.25" or scaled "725s"
	const scaled = aiScoreRaw.endsWith("s") ? Number(aiScoreRaw.slice(0, -1)) : toScaled(Number(aiScoreRaw));

	const cfgPath = path.resolve(process.cwd(), "src/config/contracts.json");
	const { contracts } = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
	const contest = contracts?.LatentContest as `0x${string}`;
	if (!contest) throw new Error("Missing LatentContest address");

	const account = privateKeyToAccount(`0x${PK.replace(/^0x/, "")}`);
	const client = createWalletClient({ account, chain: filecoinCalibration, transport: http(RPC) });

	await client.writeContract({
		address: contest,
		abi: abi as any,
		functionName: "setAIScore",
		args: [entryId, scaled]
	});
	console.log(`AI score set for entry ${entryId} to scaled=${scaled}`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});


