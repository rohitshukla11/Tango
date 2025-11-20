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

function web3Keccak(message: string): string {
	try {
		// @ts-ignore
		const crypto = require("crypto");
		const hasher = crypto.createHash("sha3-256");
		hasher.update(message);
		return hasher.digest("hex");
	} catch {
		const h = Array.from(new TextEncoder().encode(message)).reduce((a, c) => (a * 131 + c) >>> 0, 0) >>> 0;
		return h.toString(16).padStart(64, "0");
	}
}

function selectorOf(signature: string) {
	const digest = web3Keccak(signature);
	return "0x" + digest.substring(0, 8);
}

function pad32(hexNo0x: string) {
	return hexNo0x.padStart(64, "0");
}

async function main() {
	const RPC = process.env.FILECOIN_RPC_URL || "https://api.calibration.node.glif.io/rpc/v1";
	const PK = requireEnv("FILECOIN_PRIVATE_KEY");
	const entryId = BigInt(requireEnv("ENTRY_ID"));
	const scoreScaled = BigInt(requireEnv("SCORE_SCALED"));
	const saltHex = requireEnv("SALT_HEX").replace(/^0x/, "");
	const cfgPath = path.resolve(process.cwd(), "src/config/contracts.json");
	const { contracts } = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
	const pmAddress = contracts?.PredictionManager as `0x${string}`;
	if (!pmAddress) throw new Error("Missing PredictionManager address");

	const account = privateKeyToAccount(`0x${PK.replace(/^0x/, "")}`);
	const client = createWalletClient({ account, chain: filecoinCalibration, transport: http(RPC) });

	const selector = selectorOf("reveal(uint256,uint16,bytes32)");
	const data = ("0x" +
		selector.replace(/^0x/, "") +
		pad32(entryId.toString(16)) +
		pad32(scoreScaled.toString(16)) +
		pad32(saltHex)
	) as `0x${string}`;

	const hash = await client.sendTransaction({ account, to: pmAddress, data });
	console.log("Reveal tx:", hash);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});


