#!/usr/bin/env ts-node
/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import { createWalletClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { filecoinCalibration } from "viem/chains";

function requireEnv(name: string, fallback?: string) {
	const v = process.env[name] ?? fallback;
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

function abiEncodeUint16AndBytes32(num: number, saltHex: string): string {
	const n = BigInt(num);
	const salt = saltHex.replace(/^0x/, "");
	return "0x" + n.toString(16).padStart(64, "0") + salt.padStart(64, "0");
}

function selectorOf(signature: string) {
	const digest = web3Keccak(signature);
	return "0x" + digest.substring(0, 8);
}

async function main() {
	const RPC = requireEnv("FILECOIN_RPC_URL", "https://api.calibration.node.glif.io/rpc/v1");
	const PK = requireEnv("FILECOIN_PRIVATE_KEY");
	const STAKE = requireEnv("CREATOR_STAKE_FIL", "0.05");
	const videoCid = requireEnv("VIDEO_CID");
	const predicted = Number(requireEnv("PREDICTED_SCORE"));
	const scoreScaled = Math.round(Math.max(0, Math.min(10, predicted)) * 100);
	const saltHex = (process.env.SALT_HEX && process.env.SALT_HEX.startsWith("0x")) ? process.env.SALT_HEX : "0x" + Math.floor(Math.random() * 1e16).toString(16);
	const commitHash = "0x" + web3Keccak(Buffer.from(abiEncodeUint16AndBytes32(scoreScaled, saltHex).slice(2), "hex").toString("hex"));

	const cfgPath = path.resolve(process.cwd(), "src/config/contracts.json");
	const { contracts } = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
	const contestAddress = contracts?.LatentContest as `0x${string}`;
	if (!contestAddress) throw new Error("Missing LatentContest address in src/config/contracts.json");

	const account = privateKeyToAccount(`0x${PK.replace(/^0x/, "")}`);
	const client = createWalletClient({ account, chain: filecoinCalibration, transport: http(RPC) });

	const selector = selectorOf("createEntry(string,bytes32)");
	// ABI encode: string is dynamic, bytes32 fixed
	const videoBytes = Buffer.from(videoCid, "utf8");
	const videoPaddedLen = Math.ceil(videoBytes.length / 32) * 32;
	const head = "0x" +
		"20".padStart(64, "0") + // offset to string data (32 bytes)
		commitHash.replace(/^0x/, ""); // bytes32
	const strData = Buffer.concat([
		Buffer.from(BigInt(videoBytes.length).toString(16).padStart(64, "0"), "hex"),
		Buffer.concat([videoBytes, Buffer.alloc(videoPaddedLen - videoBytes.length)]) // padded string
	]);
	const data = (selector + head.slice(2) + Buffer.from(strData).toString("hex")) as `0x${string}`;

	console.log("Committing with", { videoCid, scoreScaled, saltHex, commitHash });
	const hash = await client.sendTransaction({
		account,
		to: contestAddress,
		data,
		value: parseEther(STAKE)
	});
	console.log("Tx:", hash);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});


