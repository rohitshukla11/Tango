// Synapse SDK / Filecoin Onchain Cloud utilities
// Based on: https://deepwiki.com/FilOzone/synapse-sdk/2.3-configuration-options
//
// Configuration:
// - Authentication: Uses privateKey from FILECOIN_PRIVATE_KEY (server/backend)
// - Network: Auto-detected from FILECOIN_RPC_URL (mainnet/calibration)
// - Storage: Uses StorageManager for uploads/downloads
// - Payments: Uses PaymentsService for USDFC token integration
//
// Environment variables required:
// - FILECOIN_RPC_URL (defaults to calibration testnet)
// - FILECOIN_PRIVATE_KEY (hex format, with or without 0x prefix)
//
// To install official SDK:
//   npm install @synapse/synapse-sdk
//
// Then replace this wrapper with actual SDK calls.

export type UploadResponse = { cid: string; bytes?: number };
export type StorageEstimate = { amount: number; token: string };
import { createSynapseFromEnv, createSynapseFromBrowser } from "./synapse";
import { ethers } from "ethers";

function requireEnv(name: string): string {
	const v = process.env[name];
	if (!v) {
		throw new Error(`Missing env ${name}`);
	}
	return v;
}

function authHeaders() {
	const key = requireEnv("SYNAPSE_API_KEY");
	return {
		"Authorization": `Bearer ${key}`
	};
}

function baseUrl(): string {
	return requireEnv("SYNAPSE_API_BASE");
}

// IMPORTANT: Always use server-side private key for Filecoin operations
// This removes the need for users to add Filecoin network to MetaMask
// Users stay on Base network, server handles all Filecoin interactions
function canUseBrowserSigner(): boolean {
	// DISABLED: No longer using browser signer for Filecoin operations
	// All Filecoin transactions now use server-side private key
	return false;
}
function shouldUseSdk(): boolean {
	// Always use SDK with server private key (no browser signer)
	return Boolean(process.env.FILECOIN_PRIVATE_KEY || process.env.FILECOIN_RPC_URL) && !process.env.SYNAPSE_API_BASE;
}

// Setup payments: Following official Synapse SDK documentation pattern
// Reference: https://synapse-sdk-docs.netlify.app/developer-guides/storage/storage-costs/
// This prepares the account for storage operations by calculating costs and ensuring sufficient funds/allowances
export async function setupPayments(
	estimatedSizeBytes: number = 100 * 1024 * 1024, // Default 100MB estimate
	durationDays: number = 30 // Default 30 days
): Promise<{ deposited: boolean; approved: boolean; synapse: any }> {
	if (!shouldUseSdk()) {
		throw new Error("SDK not available for payment setup");
	}
	
	// Always use server-side private key (no browser signer for Filecoin)
	const synapse = await createSynapseFromEnv();
	
	if (!synapse?.payments) {
		throw new Error("Synapse payments service not available");
	}
	
	// Import TIME_CONSTANTS from SDK for epoch calculations
	const TIME_CONSTANTS = {
		EPOCHS_PER_DAY: 2880n,
		EPOCHS_PER_MONTH: 86400n,
	};
	
	console.log("[Payments] Starting payment setup...");
	console.log("[Payments] Estimated size:", estimatedSizeBytes, "bytes");
	console.log("[Payments] Duration:", durationDays, "days");
	
	// Step 1: Get Warm Storage address (service we're paying)
	const warmStorageAddress = synapse.getWarmStorageAddress();
	console.log("[Payments] Warm Storage address:", warmStorageAddress);
	
	// Step 2: Run preflight check to calculate costs (with fallback)
	// This estimates the cost for storing data based on size and duration
	let preflightInfo;
	let costPerEpoch: bigint;
	
	try {
		preflightInfo = await synapse.storage.preflightUpload(estimatedSizeBytes, {
			withCDN: true
		});
		
		console.log("[Payments] Raw preflight response:", preflightInfo);
		
		// Extract cost data - the response structure has estimatedCost.perEpoch (not costPerEpoch!)
		const estimatedCost = preflightInfo?.estimatedCost;
		costPerEpoch = estimatedCost?.perEpoch; // ← Correct property name!
		const totalCostPerMonth = estimatedCost?.perMonth;
		
		// Check if preflight returned valid values
		if (costPerEpoch != null && costPerEpoch > 0n) {
			console.log("[Payments] ✅ Preflight succeeded:", {
				pieceSize: preflightInfo?.pieceSize,
				perEpoch: ethers.formatUnits(costPerEpoch, 18) + " USDFC",
				perMonth: totalCostPerMonth ? ethers.formatUnits(totalCostPerMonth, 18) + " USDFC" : "N/A",
				selectedProvider: preflightInfo?.selectedProvider,
				selectedDataSetId: preflightInfo?.selectedDataSetId
			});
		} else {
			console.warn("[Payments] ⚠️ Preflight returned invalid data:", {
				hasPreflightInfo: !!preflightInfo,
				hasEstimatedCost: !!estimatedCost,
				perEpoch: costPerEpoch,
				rawEstimatedCost: estimatedCost
			});
			throw new Error("Preflight returned null/zero cost");
		}
	} catch (preflightError: any) {
		console.error("[Payments] ❌ Preflight error:", preflightError.message || preflightError);
		// Fallback: Use conservative estimate based on Warm Storage minimums
		// According to error logs, Warm Storage requires minimum ~6 USDFC total
		// Set a per-epoch rate that will result in sufficient total cost
		console.warn("[Payments] Preflight failed, using conservative fallback:", preflightError);
		
		// Use a minimum per-epoch rate that ensures we meet service requirements
		// 8 USDFC total ÷ 86400 epochs = ~0.0000926 USDFC per epoch (minimum)
		// Let's use 2x that for safety: ~0.000185 USDFC per epoch
		const minimumTotalCost = ethers.parseUnits("8", 18); // 8 USDFC minimum
		const epochsPerMonth = 86400n;
		costPerEpoch = minimumTotalCost / epochsPerMonth; // Approximately 0.0000694 USDFC per epoch
		
		console.log("[Payments] Fallback calculation:", {
			estimatedSizeMB: (estimatedSizeBytes / (1024 * 1024)).toFixed(2),
			costPerEpoch: ethers.formatUnits(costPerEpoch, 18) + " USDFC",
			note: "Using conservative minimum based on Warm Storage requirements"
		});
	}
	
	// Step 3: Get current account info and service approval status
	const accountInfo = await synapse.payments.accountInfo("USDFC");
	const approval = await synapse.payments.serviceApproval(warmStorageAddress, "USDFC");
	
	console.log("[Payments] Current account:", {
		availableFunds: ethers.formatUnits(accountInfo.availableFunds, 18) + " USDFC",
		totalFunds: ethers.formatUnits(accountInfo.funds, 18) + " USDFC"
	});
	
	console.log("[Payments] Current approval:", {
		isApproved: approval.isApproved,
		rateAllowance: ethers.formatUnits(approval.rateAllowance, 18) + " USDFC/epoch",
		lockupAllowance: ethers.formatUnits(approval.lockupAllowance, 18) + " USDFC"
	});
	
	// Step 4: Calculate needed allowances based on cost per epoch
	// Following the official docs pattern for cumulative rate calculation
	const epochsNeeded = BigInt(durationDays) * TIME_CONSTANTS.EPOCHS_PER_DAY;
	
	// Calculate allowances with safety margin (2x)
	let rateAllowanceNeeded = costPerEpoch * 2n;
	let lockupAllowanceNeeded = rateAllowanceNeeded * epochsNeeded;
	
	// CRITICAL: Enforce Warm Storage minimum requirement of 8 USDFC
	// Increased from 6 USDFC to 8 USDFC to cover new data set creation costs
	const minimumTotalDeposit = ethers.parseUnits("8", 18); // 8 USDFC minimum
	
		if (lockupAllowanceNeeded < minimumTotalDeposit) {
			console.log("[Payments] ⚠️ Calculated amount too low, enforcing minimum 8 USDFC");
			console.log("[Payments] Before:", ethers.formatUnits(lockupAllowanceNeeded, 18), "USDFC");
		
		// Adjust the rate to meet the minimum total requirement
		lockupAllowanceNeeded = minimumTotalDeposit;
		rateAllowanceNeeded = minimumTotalDeposit / epochsNeeded;
		
		console.log("[Payments] After adjustment:", {
			rateAllowance: ethers.formatUnits(rateAllowanceNeeded, 18) + " USDFC/epoch",
			lockupAllowance: ethers.formatUnits(lockupAllowanceNeeded, 18) + " USDFC"
		});
	}
	
	const totalCostNeeded = lockupAllowanceNeeded;
	
	console.log("[Payments] Calculated requirements:", {
		epochsNeeded: epochsNeeded.toString(),
		rateAllowanceNeeded: ethers.formatUnits(rateAllowanceNeeded, 18) + " USDFC/epoch",
		lockupAllowanceNeeded: ethers.formatUnits(lockupAllowanceNeeded, 18) + " USDFC",
		totalCostNeeded: ethers.formatUnits(totalCostNeeded, 18) + " USDFC"
	});
	
	// Step 5: Calculate deposit amount needed
	// Following the official docs: depositAmountNeeded = totalCostNeeded - availableFunds
	const depositAmountNeeded = totalCostNeeded > accountInfo.availableFunds
		? totalCostNeeded - accountInfo.availableFunds
		: 0n;
	
	// Step 6: Check if allowances are sufficient
	const allowancesSufficient = 
		rateAllowanceNeeded <= approval.rateAllowance &&
		lockupAllowanceNeeded <= approval.lockupAllowance;
	
	console.log("[Payments] Needs assessment:", {
		depositNeeded: ethers.formatUnits(depositAmountNeeded, 18) + " USDFC",
		allowancesSufficient
	});
	
	// Step 7: Verify wallet balance if deposit is needed
	if (depositAmountNeeded > 0n) {
		const walletBalance = await synapse.payments.walletBalance("USDFC");
		console.log("[Payments] Wallet balance:", ethers.formatUnits(walletBalance, 18), "USDFC");
		
		if (walletBalance < depositAmountNeeded) {
			throw new Error(
				`Insufficient USDFC balance. ` +
				`Have: ${ethers.formatUnits(walletBalance, 18)} USDFC, ` +
				`Need: ${ethers.formatUnits(depositAmountNeeded, 18)} USDFC. ` +
				`Please add more USDFC to your wallet.`
			);
		}
	}
	
	// Step 8: Execute appropriate transaction (following official docs pattern)
	// This matches the exact flow from https://synapse-sdk-docs.netlify.app/developer-guides/storage/storage-costs/
	if (!allowancesSufficient && depositAmountNeeded > 0n) {
		// Need both deposit and approval - use combined transaction
		console.log("[Payments] Executing depositWithPermitAndApproveOperator...");
		await synapse.payments.depositWithPermitAndApproveOperator(
			depositAmountNeeded,
			warmStorageAddress,
			rateAllowanceNeeded,
			lockupAllowanceNeeded,
			TIME_CONSTANTS.EPOCHS_PER_MONTH // 30 days max lockup period
		);
		console.log("[Payments] ✅ Deposit and approval completed in single transaction");
	} else if (!allowancesSufficient) {
		// Only need approval update
		console.log("[Payments] Executing approveService...");
		await synapse.payments.approveService(
			warmStorageAddress,
			rateAllowanceNeeded,
			lockupAllowanceNeeded,
			TIME_CONSTANTS.EPOCHS_PER_MONTH
		);
		console.log("[Payments] ✅ Service approval updated");
	} else if (depositAmountNeeded > 0n) {
		// Only need deposit
		console.log("[Payments] Executing depositWithPermit...");
		await synapse.payments.depositWithPermit(depositAmountNeeded);
		console.log("[Payments] ✅ Funds deposited");
	} else {
		console.log("[Payments] ✅ Account already has sufficient funds and allowances");
	}
	
	console.log("[Payments] Payment setup complete!");
	return { deposited: true, approved: true, synapse };
}

export async function uploadFile(file: Blob | ArrayBuffer | Buffer, filename = "upload.bin", synapseInstance?: any): Promise<string> {
	// TEMPORARY: Mock upload for development/testing
	// Remove this after your address is whitelisted by Synapse team
	if (process.env.NEXT_PUBLIC_USE_MOCK_UPLOAD === "true") {
		console.warn("[Upload] Using MOCK upload - not actually uploading to Synapse!");
		console.warn("[Upload] Your address needs to be whitelisted by Synapse team for real uploads.");
		console.warn("[Upload] See: https://github.com/FilOzone/synapse-sdk/issues");
		
		// Generate a fake CID for development
		const mockCid = `bafybeimock${Date.now()}${Math.random().toString(36).substring(7)}`;
		await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate upload delay
		
		console.log("[Upload] Mock upload complete. CID:", mockCid);
		return mockCid;
	}
	
	if (shouldUseSdk()) {
		// Use provided synapse instance if available, otherwise create new one
		const synapse = synapseInstance || (canUseBrowserSigner() ? await createSynapseFromBrowser() : await createSynapseFromEnv());
		
		// Validate SDK instance
		if (!synapse) {
			throw new Error("Synapse SDK instance is undefined");
		}
		if (!synapse.storage) {
			throw new Error("Synapse SDK storage service not available. SDK structure: " + Object.keys(synapse).join(", "));
		}
		
		// Convert file to Uint8Array (works in both Node.js and browser)
		let data: Uint8Array;
		if (file instanceof Uint8Array) {
			data = file;
		} else if (file instanceof ArrayBuffer) {
			data = new Uint8Array(file);
		} else if (file instanceof Buffer) {
			// Node.js Buffer
			data = new Uint8Array(file);
		} else {
			// Blob/File - convert to ArrayBuffer first
			const ab = await (file as Blob).arrayBuffer();
			data = new Uint8Array(ab);
		}
		
		// Use the simplified StorageManager.upload() API which handles context creation automatically
		// This is the recommended approach from the SDK documentation
		console.log("[Upload] Uploading via synapse.storage.upload()...");
		console.log("[Upload] Data size:", data.length, "bytes");
		
		// If payments are set up (synapseInstance provided), log payment status for debugging
		if (synapseInstance) {
			try {
				const warmStorageAddress = synapse.getWarmStorageAddress();
				if (warmStorageAddress) {
					const serviceApproval = await synapse.payments.serviceApproval(warmStorageAddress, "USDFC");
					const accountInfo = await synapse.payments.accountInfo("USDFC");
					console.log("[Upload] Payment status:", {
						warmStorageAddress,
						serviceApproved: serviceApproval.isApproved,
						deposited: ethers.formatUnits(accountInfo.funds, 18) + " USDFC",
						rateAllowance: ethers.formatUnits(serviceApproval.rateAllowance, 18) + " USDFC/epoch",
						lockupAllowance: ethers.formatUnits(serviceApproval.lockupAllowance, 18) + " USDFC"
					});
				}
			} catch (statusError) {
				console.warn("[Upload] Could not verify payment status:", statusError);
			}
		}
		
		// Try to find existing data sets first (to avoid creating new ones which requires whitelisting)
		console.log("[Upload] Checking for existing data sets...");
		let existingDataSetId: number | undefined;
		try {
			const dataSets = await synapse.storage.findDataSets();
			console.log("[Upload] Found", dataSets.length, "existing data sets");
			
			// Find a data set with CDN enabled
			const cdnDataSet = dataSets.find((ds: any) => {
				// Check if the data set has CDN metadata
				const metadata = ds.metadata || {};
				return "synapse:with-cdn" in metadata;
			});
			
			if (cdnDataSet) {
				existingDataSetId = cdnDataSet.id;
				console.log("[Upload] Reusing existing data set with CDN:", existingDataSetId);
			} else if (dataSets.length > 0) {
				// Use any existing data set if no CDN-enabled one found
				existingDataSetId = dataSets[0].id;
				console.log("[Upload] Reusing existing data set (no CDN):", existingDataSetId);
			}
		} catch (findError) {
			console.warn("[Upload] Could not query existing data sets:", findError);
		}
		
		const uploadOptions: any = { 
			metadata: { filename },
			withCDN: true
		};
		
		// If we found an existing data set, use it to avoid creating a new one
		if (existingDataSetId !== undefined) {
			uploadOptions.dataSetId = existingDataSetId;
			console.log("[Upload] Using existing data set ID:", existingDataSetId);
		}
		
		// Upload using StorageManager.upload() - this will:
		// 1. Create or reuse a default storage context
		// 2. Handle provider selection automatically
		// 3. Create/reuse a data set with the specified metadata
		// 4. Upload the piece to the selected provider
		console.log("[Upload] Starting upload with options:", uploadOptions);
		
		let result;
		try {
			result = await synapse.storage.upload(data, uploadOptions);
		} catch (uploadError: any) {
			// Check if it's a whitelisting error
			if (uploadError?.message?.includes("403") || 
			    uploadError?.message?.includes("recordKeeper address not allowed") ||
			    uploadError?.message?.includes("not allowed for public service")) {
				
				const signerAddress = await synapse.getSigner().getAddress();
				throw new Error(
					`❌ Whitelisting Required\n\n` +
					`Your wallet address is not whitelisted on Synapse Calibration testnet.\n\n` +
					`Wallet: ${signerAddress}\n\n` +
					`To get whitelisted:\n` +
					`1. Join Synapse Discord: https://discord.gg/filecoin\n` +
					`2. Request whitelisting in #synapse channel\n` +
					`3. Provide your wallet address: ${signerAddress}\n\n` +
					`Alternative: Use Synapse mainnet (requires real FIL/USDFC)\n\n` +
					`Original error: ${uploadError.message}`
				);
			}
			
			// Re-throw other errors
			throw uploadError;
		}
		
		// UploadResult has pieceCid property (not cid)
		const cid = result?.pieceCid || result?.cid;
		if (!cid) {
			throw new Error("Synapse SDK upload: missing pieceCid. Result: " + JSON.stringify(result));
		}
		// pieceCid might be a PieceCID object, convert to string
		return typeof cid === "string" ? cid : String(cid);
	}
	const url = `${baseUrl()}/v1/storage/upload`;
	const form = new FormData();
	// @ts-ignore - FormData in Next.js supports Blob/BufferSource
	form.append("file", file, filename);
	const res = await fetch(url, {
		method: "POST",
		headers: {
			...authHeaders()
		},
		body: form
	});
	if (!res.ok) {
		throw new Error(`Synapse uploadFile failed: ${res.status} ${await res.text()}`);
	}
	const data = await res.json() as UploadResponse;
	if (!data.cid) {
		throw new Error("Synapse uploadFile: missing cid");
	}
	return data.cid;
}

export async function uploadJSON(obj: unknown): Promise<string> {
	// Always use SDK for JSON uploads (server-side with private key or browser with MetaMask)
	// Always use server-side private key (no browser signer for Filecoin)
	const synapse = await createSynapseFromEnv();
	
	// Validate SDK instance
	if (!synapse?.storage) {
		throw new Error("Synapse SDK storage service not available");
	}
	
	const jsonString = JSON.stringify(obj);
	const data = new Uint8Array(new TextEncoder().encode(jsonString));
	
	const result = await synapse.storage.upload(data, { metadata: { filename: "metadata.json" } });
	
	// UploadResult has pieceCid property (not cid)
	const cid = result?.pieceCid || result?.cid;
	if (!cid) {
		throw new Error("Synapse SDK uploadJSON: missing pieceCid. Result: " + JSON.stringify(result));
	}
	return typeof cid === "string" ? cid : String(cid);
}

/**
 * Download a file from Synapse using its CID
 * @param cid - Content Identifier of the file to download
 * @returns ArrayBuffer containing the file data
 */

export async function getFile(cid: string): Promise<ArrayBuffer> {
	if (shouldUseSdk()) {
		try {
			// Always use server-side private key (no browser signer for Filecoin)
	const synapse = await createSynapseFromEnv();
			
			// Download via Synapse SDK
			console.log("[Download] Fetching file from Synapse:", cid);
			const data = await synapse.storage.download(cid);
			console.log("[Download] File retrieved successfully, size:", data.byteLength, "bytes");
			return data;
		} catch (error: any) {
			console.error("[Download] Synapse download failed:", error.message);
			throw new Error(`Failed to download from Synapse: ${error.message}`);
		}
	}
	
	// Legacy HTTP wrapper path if API base is configured
	if (process.env.SYNAPSE_API_BASE) {
		const url = `${baseUrl()}/v1/storage/${cid}`;
		const res = await fetch(url, {
			method: "GET",
			headers: {
				...authHeaders()
			}
		});
		if (!res.ok) {
			throw new Error(`Synapse REST download failed: ${res.status} ${res.statusText}`);
		}
		return await res.arrayBuffer();
	}
	
	// No fallback - must use Synapse
	throw new Error("Synapse SDK or SYNAPSE_API_BASE must be configured to download files");
}

// Estimate the storage cost for a given CID (token typically USDC or FIL)
/**
 * Get video URL from CID for display in video players
 * Returns API route URL that streams from Synapse
 * @param cid - Content Identifier (CID) of the video file
 * @returns API route URL for video streaming
 */
export function getVideoUrl(cid: string): string {
	// Use API route that streams from Synapse
	return `/api/video/${cid}`;
}

/**
 * Verify if a file is stored on Synapse by attempting to download it
 * @param cid - Content Identifier (CID) of the file
 * @returns Promise resolving to true if file is accessible via Synapse, false otherwise
 */
export async function verifyFileStorage(cid: string): Promise<{
	accessible: boolean;
	error?: string;
}> {
	try {
		await getFile(cid);
		return { accessible: true };
	} catch (error: any) {
		return { accessible: false, error: error.message };
	}
}

/**
 * @deprecated This function is no longer needed as storage costs are estimated during setupPayments()
 * Use preflightUpload() in setupPayments() instead
 */
export async function estimateStorageCost(cid: string): Promise<StorageEstimate> {
	console.warn('[Deprecated] estimateStorageCost() is deprecated. Cost estimation is handled in setupPayments()');
	return { amount: 0, token: "USDFC" };
}

// Overloaded payForStorage:
// 1) Legacy: payForStorage(cid, bytes)
// 2) New: payForStorage({ cid, amount, token })
export async function payForStorage(cid: string, bytes: number): Promise<{ paid: boolean; txId?: string }>;
export async function payForStorage(args: { cid: string; amount: number; token: string }): Promise<{ paid: boolean; txId?: string }>;
export async function payForStorage(a: any, b?: any): Promise<{ paid: boolean; txId?: string }> {
	if (shouldUseSdk()) {
		// Always use server-side private key (no browser signer for Filecoin)
	const synapse = await createSynapseFromEnv();
		if (typeof a === "string") {
			// If bytes provided, estimate amount first
			// @ts-ignore
			const est = await synapse.payments.estimateCost(a);
			// @ts-ignore
			const r = await synapse.payments.payForStorage({ cid: a, amount: est.amount, token: est.token ?? "USDFC" });
			return { paid: true, txId: r?.txId };
		} else {
			// @ts-ignore
			const r = await synapse.payments.payForStorage({ cid: a.cid, amount: a.amount, token: a.token });
			return { paid: true, txId: r?.txId };
		}
	}
	const url = `${baseUrl()}/v1/storage/pay`;
	let body: any;
	if (typeof a === "string") {
		body = { cid: a, bytes: b, rails: process.env.SYNAPSE_STABLECOIN || "USDFC" };
	} else {
		body = { cid: a.cid, amount: a.amount, token: a.token, rails: process.env.SYNAPSE_STABLECOIN || a.token || "USDFC" };
	}
	const res = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...authHeaders()
		},
		body: JSON.stringify(body)
	});
	if (!res.ok) {
		throw new Error(`Synapse payForStorage failed: ${res.status} ${await res.text()}`);
	}
	const data = await res.json();
	return { paid: Boolean(data?.paid ?? true), txId: data?.txId };
}

// Demo helper: platform storage wallet balance
export async function getPlatformStorageBalance(token: string): Promise<number> {
	// Prefer public env for client-side demo balance
	const key = `NEXT_PUBLIC_DEMO_STORAGE_BALANCE_${token.toUpperCase()}`;
	const v = (typeof window === "undefined" ? process.env[key] : (process as any).env?.[key]) || process.env[key];
	if (v) return Number(v);
	// Fallback to 0.05 USDC demo
	return token.toUpperCase() === "USDC" ? 0.05 : 0;
}


