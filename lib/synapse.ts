// @ts-nocheck - package exports may not be properly defined but works at runtime
// Synapse SDK / Filecoin Onchain Cloud integration
// Based on: https://deepwiki.com/FilOzone/synapse-sdk/2.3-configuration-options
//
// Configuration Options:
// - Authentication: privateKey (server/backend) or provider (browser)
// - Network: Auto-detected from RPC endpoint (mainnet/calibration)
// - Storage: StorageManager for uploads/downloads
// - Payments: PaymentsService for USDFC token integration

import { ethers } from "ethers";
import { RPC_URLS } from "@filoz/synapse-sdk";

// NOTE: Replace with actual @synapse/synapse-sdk package when available
// For now, this is a wrapper that will use the official SDK once installed
// Install: npm install @synapse/synapse-sdk

export type SynapseConfig = {
	// Authentication (choose one)
	privateKey?: string; // For server/backend
	provider?: ethers.Provider; // For browser
	signer?: ethers.Signer; // Direct signer instance

	// Network
	rpcURL: string; // Filecoin RPC endpoint (auto-detects mainnet/calibration)

	// Optional overrides
	warmStorageAddress?: string;
	pdpVerifierAddress?: string;

	// Advanced options
	enableCDN?: boolean; // Enable CDN-based retrieval
	disableNonceManager?: boolean; // Disable automatic nonce management
};

export type StorageEstimate = {
	amount: number; // Cost in USDC or FIL
	token: string; // "USDC" or "FIL"
};

// Initialize Synapse SDK instance
// Based on Synapse SDK configuration architecture
export async function initSynapse(config: SynapseConfig) {
	// Try to load official SDK (@filoz/synapse-sdk)
	const synMod: any = await import("@filoz/synapse-sdk").catch((e) => {
		throw new Error("Missing dependency @filoz/synapse-sdk. Install with `npm i @filoz/synapse-sdk ethers`.");
	});
	const Synapse = synMod?.Synapse || synMod?.default;
	if (!Synapse) {
		throw new Error("Incompatible @filoz/synapse-sdk: expected export Synapse/default.");
	}

	// Build options object matching SynapseOptions interface
	const options: any = {
		withCDN: config.enableCDN ?? true,
		rpcURL: config.rpcURL,
	};

	// Add authentication (one of: privateKey, signer, or provider)
	if (config.privateKey) {
		options.privateKey = config.privateKey.startsWith("0x") ? config.privateKey : `0x${config.privateKey}`;
	} else if (config.signer) {
		options.signer = config.signer;
	} else if (config.provider) {
		options.provider = config.provider;
	}

	if (config.warmStorageAddress) {
		options.warmStorageAddress = config.warmStorageAddress;
	}
	if (config.pdpVerifierAddress) {
		options.pdpVerifierAddress = config.pdpVerifierAddress;
	}
	if (config.disableNonceManager !== undefined) {
		options.disableNonceManager = config.disableNonceManager;
	}

	// Use static create() method instead of constructor
	return await Synapse.create(options);
}

// Helper to create Synapse instance from environment variables
let _singleton: Promise<any> | null = null;
export function createSynapseFromEnv(): Promise<any> {
	const rpcURL = RPC_URLS.calibration.http;
	const privateKey = process.env.FILECOIN_PRIVATE_KEY;

	if (!privateKey) {
		throw new Error("FILECOIN_PRIVATE_KEY required for Synapse SDK initialization");
	}

	if (!_singleton) {
		_singleton = initSynapse({
			privateKey: privateKey.replace(/^0x/, ""),
			rpcURL,
			enableCDN: true,
		});
	}
	return _singleton;
}

// Browser-side Synapse using MetaMask (no server private key)
export async function createSynapseFromBrowser(): Promise<any> {
	// Ensure window.ethereum is available
	if (typeof window === "undefined" || !(window as any).ethereum) {
		throw new Error("Ethereum provider not found. Please install MetaMask.");
	}
	const provider = new ethers.BrowserProvider((window as any).ethereum);
	const signer = await provider.getSigner();
	const rpcURL = RPC_URLS.calibration.http;
	return initSynapse({
		signer,
		rpcURL,
		enableCDN: true
	});
}

