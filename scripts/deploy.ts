#!/usr/bin/env ts-node
/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import solc from "solc";
import { createWalletClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { filecoinCalibration } from "viem/chains";

type Compiled = {
	abi: any[];
	bytecode: `0x${string}`;
};

function requireEnv(name: string, fallback?: string) {
	const v = process.env[name] ?? fallback;
	if (!v) throw new Error(`Missing env ${name}`);
	return v;
}

function readContracts(): Record<string, { content: string }> {
	const dir = path.resolve(process.cwd(), "contracts");
	const files = fs.readdirSync(dir).filter(f => f.endsWith(".sol") || fs.statSync(path.join(dir, f)).isDirectory());
	const sources: Record<string, { content: string }> = {};
	function addFile(rel: string) {
		const full = path.join(dir, rel);
		const stat = fs.statSync(full);
		if (stat.isDirectory()) {
			for (const f of fs.readdirSync(full)) addFile(path.join(rel, f));
			return;
		}
		if (rel.endsWith(".sol")) {
			const content = fs.readFileSync(full, "utf8");
			sources[rel.replace(/\\/g, "/")] = { content };
		}
	}
	for (const f of files) addFile(f);
	return sources;
}

function compile(): Record<string, Compiled> {
	const input = {
		language: "Solidity",
		sources: readContracts(),
		settings: {
			optimizer: { enabled: true, runs: 200 },
			outputSelection: {
				"*": {
					"*": ["abi", "evm.bytecode.object"]
				}
			}
		}
	};
	const output = JSON.parse(solc.compile(JSON.stringify(input)));
	if (output.errors) {
		const fatal = output.errors.filter((e: any) => e.severity === "error");
		if (fatal.length) {
			for (const e of fatal) console.error(e.formattedMessage || e.message);
			throw new Error("Solc compilation failed");
		}
		for (const e of output.errors) console.warn(e.formattedMessage || e.message);
	}
	const compiled: Record<string, Compiled> = {};
	for (const file of Object.keys(output.contracts)) {
		for (const name of Object.keys(output.contracts[file])) {
			const art = output.contracts[file][name];
			compiled[name] = {
				abi: art.abi,
				bytecode: ("0x" + art.evm.bytecode.object) as `0x${string}`
			};
		}
	}
	return compiled;
}

async function main() {
	const RPC = requireEnv("FILECOIN_RPC_URL", "https://api.calibration.node.glif.io/rpc/v1");
	const PK = requireEnv("FILECOIN_PRIVATE_KEY");
	const TREASURY = requireEnv("PLATFORM_TREASURY", "");
	const account = privateKeyToAccount(`0x${PK.replace(/^0x/, "")}`);
	const client = createWalletClient({
		account,
		chain: filecoinCalibration,
		transport: http(RPC)
	});

	console.log("Compiling contracts...");
	const c = compile();

	const LatentContest = c["LatentContest"];
	const PredictionManager = c["PredictionManager"];
	const PrizePayout = c["PrizePayout"];
	if (!LatentContest || !PredictionManager || !PrizePayout) {
		throw new Error("Missing compiled contracts");
	}

	console.log("Deploying LatentContest...");
	const hashContest = await client.deployContract({
		abi: LatentContest.abi,
		bytecode: LatentContest.bytecode,
		args: [TREASURY || account.address],
		account
	});
	// @ts-ignore - waitForTransactionReceipt exists on client at runtime
	const receiptContest = await client.waitForTransactionReceipt({ hash: hashContest });
	const contestAddress = receiptContest.contractAddress!;
	console.log("LatentContest at", contestAddress);

	console.log("Deploying PredictionManager...");
	const hashPM = await client.deployContract({
		abi: PredictionManager.abi,
		bytecode: PredictionManager.bytecode,
		args: [contestAddress],
		account
	});
	// @ts-ignore - waitForTransactionReceipt exists on client at runtime
	const receiptPM = await client.waitForTransactionReceipt({ hash: hashPM });
	const pmAddress = receiptPM.contractAddress!;
	console.log("PredictionManager at", pmAddress);

	console.log("Deploying PrizePayout...");
	const hashPP = await client.deployContract({
		abi: PrizePayout.abi,
		bytecode: PrizePayout.bytecode,
		args: [contestAddress, pmAddress, account.address],
		account
	});
	// @ts-ignore - waitForTransactionReceipt exists on client at runtime
	const receiptPP = await client.waitForTransactionReceipt({ hash: hashPP });
	const ppAddress = receiptPP.contractAddress!;
	console.log("PrizePayout at", ppAddress);

	// Wire contest -> managers
	const setPmData = encodeFunction(LatentContest.abi, "setPredictionManager", [pmAddress]);
	const setPpData = encodeFunction(LatentContest.abi, "setPrizePayout", [ppAddress]);
	const setJudgeData = encodeFunction(LatentContest.abi, "setJudge", [account.address]);
	await client.sendTransaction({ account, to: contestAddress, data: setPmData });
	await client.sendTransaction({ account, to: contestAddress, data: setPpData });
	await client.sendTransaction({ account, to: contestAddress, data: setJudgeData });

	// Persist addresses for frontend
	const out = {
		network: "filecoin-calibration",
		contracts: {
			LatentContest: contestAddress,
			PredictionManager: pmAddress,
			PrizePayout: ppAddress
		}
	};
	const outPath = path.resolve(process.cwd(), "src/config/contracts.json");
	fs.mkdirSync(path.dirname(outPath), { recursive: true });
	fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
	console.log("Saved addresses to", outPath);
}

function encodeFunction(abi: any[], name: string, args: any[]): `0x${string}` {
	// Lazy, avoids pulling viem's AbiEncoder
	const iface = findFn(abi, name);
	if (!iface) throw new Error(`fn ${name} not found`);
	const selector = selectorOf(iface);
	const encodedArgs = encodeArgs(iface.inputs || [], args);
	return (selector + encodedArgs.slice(2)) as `0x${string}`;
}

function findFn(abi: any[], name: string) {
	return abi.find((x: any) => x.type === "function" && x.name === name);
}

function selectorOf(fn: any): `0x${string}` {
	const sig = `${fn.name}(${(fn.inputs || []).map((i: any) => i.type).join(",")})`;
	// keccak256
	const digest = web3Keccak(sig);
	return (`0x${digest.substring(0, 8)}`) as `0x${string}`;
}

function web3Keccak(message: string): string {
	// Minimal keccak256 via Node crypto's sha3-256 if available; fallback to deterministic hash for demo.
	try {
		// @ts-ignore
		const crypto = require("crypto");
		const hasher = crypto.createHash("sha3-256");
		hasher.update(message);
		return hasher.digest("hex");
	} catch {
		// Fallback non-secure hash (demo only)
		const h = Array.from(new TextEncoder().encode(message)).reduce((a, c) => (a * 131 + c) >>> 0, 0) >>> 0;
		return h.toString(16).padStart(64, "0");
	}
}

function encodeArgs(inputs: any[], args: any[]): `0x${string}` {
	// For the three admin functions we call, args are single address.
	const typs = inputs.map((i: any) => i.type);
	if (typs.length === 1 && typs[0] === "address") {
		const addr = (args[0] as string).toLowerCase().replace(/^0x/, "");
		return ("0x" + addr.padStart(64, "0")) as `0x${string}`;
	}
	throw new Error("encodeArgs not implemented for given types");
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});


