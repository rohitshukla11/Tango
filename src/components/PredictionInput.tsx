'use client'

import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { useScrollPrediction } from '@/hooks/useScrollPrediction'
import { formatEther } from 'ethers'
import { saveUploadedEntry, useEntries, type Entry } from '@/hooks/useEntries'

const STORAGE_KEY = 'latent_uploaded_entries'
const PREDICTION_TTL_SECONDS = Math.max(Number(process.env.NEXT_PUBLIC_PREDICTION_TTL_SECONDS ?? '900') || 900, 60)

interface PredictionInputProps {
	onPredictionSubmitted?: (requestId: string, unlockBlock: bigint) => void
	entryId?: number
	videoCid?: string
}

function formatPrice(price: bigint, symbol: string = 'ETH'): string {
	return `${formatEther(price)} ${symbol}`
}

export default function PredictionInput({ onPredictionSubmitted, entryId, videoCid }: PredictionInputProps) {
	const [predictedScore, setPredictedScore] = useState<string>('7.5')
	const [testEntryId, setTestEntryId] = useState<string>(entryId?.toString() || '1762893245')
	const [stakeAmount, setStakeAmount] = useState<string>('0.001')
	const { isConnected, address } = useAccount()
	const { submitPrediction, estimatePredictionCost, isSubmitting, status } = useScrollPrediction()
	const { entries, refreshEntries } = useEntries()
	type PredictionCost = Awaited<ReturnType<typeof estimatePredictionCost>>
	const [costEstimate, setCostEstimate] = useState<PredictionCost>(null)
	const [errorMessage, setErrorMessage] = useState<string>('')
	const [successMessage, setSuccessMessage] = useState<string>('')
	const [txHash, setTxHash] = useState<string>('')
	
	const CURRENCY_SYMBOL = 'ETH'

	// Update test entry ID when prop changes
	useEffect(() => {
		if (entryId) {
			setTestEntryId(entryId.toString())
		}
	}, [entryId])

	useEffect(() => {
		let cancelled = false

		async function loadEstimate() {
			if (!isConnected) {
				setCostEstimate(null)
				return
			}

			try {
				const cost = await estimatePredictionCost(1, stakeAmount)
				if (!cancelled) {
					setCostEstimate(cost)
				}
			} catch (err) {
				console.warn('[Scroll] Failed to estimate prediction cost', err)
				if (!cancelled) {
					setCostEstimate(null)
				}
			}
		}

		loadEstimate()

		return () => {
			cancelled = true
		}
	}, [isConnected, estimatePredictionCost, stakeAmount])

	const handleSubmit = async () => {
		setErrorMessage('')
		setSuccessMessage('')
		setTxHash('')

		const entryNumeric = Number(testEntryId)
		if (!Number.isFinite(entryNumeric) || entryNumeric <= 0) {
			setErrorMessage('Enter a valid entry ID (positive number).')
			return
		}

		const scoreValue = parseFloat(predictedScore)
		if (Number.isNaN(scoreValue) || scoreValue < 0 || scoreValue > 10) {
			setErrorMessage('Prediction must be between 0.0 and 10.0.')
			return
		}

		const stakeNumeric = Number(stakeAmount)
		if (!Number.isFinite(stakeNumeric) || stakeNumeric <= 0) {
			setErrorMessage('Stake must be greater than 0.')
			return
		}

		if (!videoCid || videoCid.trim() === '') {
			setErrorMessage('Video CID is required. Please select an entry with a video CID.')
			return
		}

		try {
			const result = await submitPrediction({
				entryId: Math.floor(entryNumeric),
				videoCid: videoCid.trim(),
				predictedScore: scoreValue,
				estimatedJudgingMinutes: 1,
				stakeAmountEth: stakeAmount,
			})

		if (!result.success) {
			setErrorMessage(result.error || 'Failed to submit prediction.')
			return
		}

		// Refresh cost estimate after successful submission
		const refreshed = await estimatePredictionCost(1, stakeAmount)
		setCostEstimate(refreshed)

		if (result.transactionHash) {
			setTxHash(result.transactionHash)
		}

		setSuccessMessage('🔐 Prediction committed! Remember to reveal after unlock block.')

		// Save prediction result to the entry
		if (result.unlockBlock && result.transactionHash && result.stakeWei && result.salt && result.commitment) {
			// Normalize IDs for comparison (handle string/number mismatches)
			const normalizedTestEntryId = String(testEntryId).trim()
			const normalizedVideoCid = videoCid?.trim() || ''
			
			console.log('[PredictionInput] Looking for entry with:', {
				testEntryId: normalizedTestEntryId,
				videoCid: normalizedVideoCid,
				entriesCount: entries.length
			})

			// Try to find entry by ID first, then by CID
			let existingEntry = entries.find((e) => {
				const entryIdMatch = String(e.id).trim() === normalizedTestEntryId
				const cidMatch = e.cid?.trim() === normalizedVideoCid && normalizedVideoCid !== ''
				return entryIdMatch || cidMatch
			})

			// If not found in state, check localStorage directly
			if (!existingEntry) {
				try {
					const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
					if (raw) {
						const storedEntries = JSON.parse(raw) as typeof entries
						console.log('[PredictionInput] Checking localStorage, found', storedEntries.length, 'entries')
						existingEntry = storedEntries.find((e) => {
							const entryIdMatch = String(e.id).trim() === normalizedTestEntryId
							const cidMatch = e.cid?.trim() === normalizedVideoCid && normalizedVideoCid !== ''
							return entryIdMatch || cidMatch
						})
					}
				} catch (err) {
					console.warn('[PredictionInput] Failed to read entries from localStorage:', err)
				}
			}

			if (existingEntry) {
				console.log('[PredictionInput] ✅ Found existing entry:', {
					id: existingEntry.id,
					cid: existingEntry.cid,
					hasPrediction: !!existingEntry.predictionResult
				})
			} else {
				console.warn('[PredictionInput] ⚠️ No existing entry found. Creating new entry with prediction result.')
			}

			// Merge prediction result with existing entry (preserve all existing fields)
			const updatedEntry: Entry = {
				id: existingEntry?.id ?? normalizedTestEntryId,
				cid: existingEntry?.cid ?? normalizedVideoCid,
				creator: existingEntry?.creator ?? address ?? '0x0',
				status: existingEntry?.status ?? 'pending',
				createdAt: existingEntry?.createdAt ?? Date.now(),
				thumbnailUrl: existingEntry?.thumbnailUrl ?? (normalizedVideoCid ? `https://ipfs.io/ipfs/${normalizedVideoCid}` : undefined),
				aiScore: existingEntry?.aiScore,
				aiJudges: existingEntry?.aiJudges,
				audienceScore: existingEntry?.audienceScore,
				predictionResult: {
					transactionHash: result.transactionHash,
					unlockBlock: result.unlockBlock.toString(),
					stakeWei: result.stakeWei.toString(),
					totalValueWei: result.totalValueWei?.toString() ?? '0',
					predictedScore: scoreValue,
					submittedAt: Date.now(),
					salt: result.salt,
					commitment: result.commitment,
				},
			}

			console.log('[PredictionInput] 💾 Saving entry with prediction result:', {
				id: updatedEntry.id,
				cid: updatedEntry.cid,
				hasPrediction: !!updatedEntry.predictionResult,
				predictionTx: updatedEntry.predictionResult?.transactionHash
			})
			saveUploadedEntry(updatedEntry)
			// Refresh entries to update UI immediately
			refreshEntries()

			try {
				await fetch('/api/arkiv/bets', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						entryId: updatedEntry.id,
						videoCid: updatedEntry.cid,
						predictor: address ?? '0x0',
						predictedScore: scoreValue,
						stakeWei: result.stakeWei.toString(),
						transactionHash: result.transactionHash,
						unlockBlock: result.unlockBlock.toString(),
						expiresInSeconds: PREDICTION_TTL_SECONDS,
						metadata: {
							submittedAt: updatedEntry.predictionResult?.submittedAt,
							totalValueWei: result.totalValueWei?.toString() ?? '0',
							salt: result.salt,
							commitment: result.commitment,
						},
					}),
				})
			} catch (err) {
				console.warn('[PredictionInput] Failed to publish Arkiv bet:', err)
			}
		} else {
			console.warn('[PredictionInput] ⚠️ Missing prediction result data, cannot save:', {
				hasUnlockBlock: !!result.unlockBlock,
				hasTxHash: !!result.transactionHash,
				hasStakeWei: !!result.stakeWei,
				hasSalt: !!result.salt
			})
		}

		if (result.unlockBlock && onPredictionSubmitted) {
			onPredictionSubmitted(result.transactionHash ?? '', result.unlockBlock)
		}
		} catch (error: any) {
			console.error('[Scroll] Submission failed:', error)
			setErrorMessage(error?.message || 'Failed to submit prediction.')
		}
	}

	return (
		<div className="space-y-4 sm:space-y-6">
			{/* Entry ID Input */}
			<div>
				<label className="block text-xs sm:text-sm font-black text-brutal-black mb-2 uppercase">
					Entry ID {entryId && <span className="text-argentina-blue">(from upload)</span>}
				</label>
				<input
					type="text"
					value={testEntryId}
					onChange={(e) => setTestEntryId(e.target.value)}
					className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-brutal-white border-4 border-brutal-black font-bold text-brutal-black focus:outline-none focus:ring-0"
					placeholder="Enter entry ID"
				/>
				{entryId && (
					<p className="text-xs font-bold text-brutal-black/60 mt-1">
						Using entry from your upload
					</p>
				)}
			</div>

			{/* Score Input */}
			<div>
				<label className="block text-xs sm:text-sm font-black text-brutal-black mb-2 uppercase">
					Your Prediction (0.0 - 10.0)
				</label>
				<div className="relative">
					<input
						type="number"
						min="0"
						max="10"
						step="0.1"
						value={predictedScore}
						onChange={(e) => setPredictedScore(e.target.value)}
						className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-brutal-white border-4 border-brutal-black font-bold text-brutal-black focus:outline-none focus:ring-0"
						placeholder="7.5"
					/>
					<div className="absolute right-3 top-1/2 -translate-y-1/2 text-brutal-black/60 text-sm font-bold">
						/ 10.0
					</div>
				</div>
				<p className="text-xs font-bold text-brutal-black/60 mt-1">
					Predict what score the AI will give your video
				</p>
			</div>

			{/* Stake Amount Input */}
			<div>
				<label htmlFor="stake-amount" className="block text-xs sm:text-sm font-black text-brutal-black mb-2 uppercase">
					Stake Amount ({CURRENCY_SYMBOL})
				</label>
				<input
					id="stake-amount"
					type="number"
					min="0"
					step="0.01"
					inputMode="decimal"
					value={stakeAmount}
					onChange={(e) => setStakeAmount(e.target.value)}
					className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-brutal-white border-4 border-brutal-black font-bold text-brutal-black focus:outline-none focus:ring-0"
					placeholder="0.001"
				/>
				<p className="text-xs font-bold text-brutal-black/60 mt-1">
					Stake must be greater than 0. Higher stakes unlock larger potential payouts.
				</p>
				{costEstimate?.error && (
					<p className="text-xs font-black text-argentina-yellow mt-1 uppercase">{costEstimate.error}</p>
				)}
			</div>

			{/* Info Cards */}
			<div className="brutal-card-blue p-3 sm:p-4 space-y-2">
				<div className="flex items-start gap-2 text-xs">
					<span className="text-brutal-black text-base">🔒</span>
					<p className="font-bold text-brutal-black">
						<strong>Committed:</strong> Your prediction is committed with a hash and cannot be changed after submission.
					</p>
				</div>
				<div className="flex items-start gap-2 text-xs">
					<span className="text-brutal-black text-base">⏰</span>
					<p className="font-bold text-brutal-black">
						<strong>Time-Locked:</strong> You'll need to reveal your prediction after the unlock block.
					</p>
				</div>
				<div className="flex items-start gap-2 text-xs">
					<span className="text-brutal-black text-base">💰</span>
					<p className="font-bold text-brutal-black">
						<strong>Prize Share:</strong> More accurate predictions earn bigger prize shares.
					</p>
				</div>
			</div>

			{/* Submit Button */}
			<button
				onClick={handleSubmit}
				disabled={isSubmitting || !isConnected || !testEntryId}
				className="w-full brutal-btn-blue px-6 py-4 text-base sm:text-lg disabled:opacity-50 disabled:cursor-not-allowed"
			>
				{!isConnected 
					? '🔌 CONNECT WALLET FIRST' 
					: isSubmitting 
						? '🔐 COMMITTING & SUBMITTING...' 
						: '🔐 SUBMIT PREDICTION'}
			</button>

			{/* Status & messages */}
			<div className="space-y-2 pt-2">
				{status && (
					<div className="brutal-card-blue p-3 text-center">
						<p className="text-xs sm:text-sm font-black text-brutal-black">{status}</p>
					</div>
				)}
				{successMessage && (
					<div className="brutal-card p-3 border-4 border-green-500 bg-green-100 text-center">
						<p className="text-xs sm:text-sm font-black text-green-800">{successMessage}</p>
					</div>
				)}
				{errorMessage && (
					<div className="brutal-card p-3 border-4 border-red-500 bg-red-100 text-center">
						<p className="text-xs sm:text-sm font-black text-red-800">{errorMessage}</p>
					</div>
				)}
				{txHash && (
					<div className="brutal-card p-2 text-center">
						<p className="text-xs font-mono font-bold text-brutal-black/60 break-all">
							Transaction:{' '}
							<a
								href={`${process.env.NEXT_PUBLIC_STAKING_EXPLORER_URL || 'https://sepolia.scrollscan.com'}/tx/${txHash}`}
								target="_blank"
								rel="noopener noreferrer"
								className="text-argentina-blue hover:underline"
							>
								{txHash.slice(0, 10)}...{txHash.slice(-8)}
							</a>
						</p>
					</div>
				)}
				{costEstimate && (
					<div className="brutal-card p-3 text-center space-y-1">
						<div className="text-xs font-black text-brutal-black">
							Total: <span className="text-argentina-blue">{formatPrice(costEstimate.total, CURRENCY_SYMBOL)}</span>
						</div>
						<div className="text-xs font-bold text-brutal-black/70">Stake: {formatPrice(costEstimate.stake, CURRENCY_SYMBOL)}</div>
					</div>
				)}
			</div>

			{!isConnected && (
				<p className="text-xs text-center font-black text-argentina-yellow uppercase">
					⚠️ Connect your wallet to submit a prediction
				</p>
			)}
		</div>
	)
}
