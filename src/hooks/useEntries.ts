'use client'

import { useState, useEffect } from 'react'

export interface AIJudgeResult {
	name: string
	persona: string
	score: number
	comment: string
}

export interface PredictionResult {
	transactionHash: string
	unlockBlock: string  // Store as string for JSON serialization
	stakeWei: string     // Store as string for JSON serialization
	totalValueWei: string    // Store as string for JSON serialization
	predictedScore: number
	submittedAt: number
	settledAt?: number
	revealedAt?: number  // When prediction was revealed
	salt?: string  // Salt used for commitment (needed for reveal)
	commitment?: string  // Commitment hash
	// Settlement results
	payoutWei?: string  // Payout amount in wei
	aiScoreScaled?: number  // AI score scaled (0-1000)
	predictedScoreScaled?: number  // Predicted score scaled (0-1000)
	diff?: number  // Difference between predicted and AI score
	result?: 'won' | 'lost'  // Win/loss status
}

export interface Entry {
	id: string
	cid: string
	creator: string
	aiScore?: number
	aiJudges?: AIJudgeResult[]
	audienceScore?: number
	status: 'pending' | 'judged' | 'finalized'
	thumbnailUrl?: string
	createdAt?: number
	predictionResult?: PredictionResult  // Renamed from blockLockResult
}

const STORAGE_KEY = 'latent_uploaded_entries'

export function useEntries() {
	const [entries, setEntries] = useState<Entry[]>([])

	// Load entries from localStorage
	const loadEntries = () => {
		try {
			const stored = localStorage.getItem(STORAGE_KEY)
			if (stored) {
				const localEntries: Entry[] = JSON.parse(stored)
				// Sort by creation time (newest first)
				localEntries.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
				setEntries(localEntries)
			} else {
				setEntries([])
			}
		} catch (error) {
			console.error('[Entries] Failed to load from localStorage:', error)
			setEntries([])
		}
	}

	// Load entries on mount and listen for storage changes
	useEffect(() => {
		loadEntries()

		// Listen for storage changes (when entry is saved in another tab/window)
		const handleStorageChange = (e: StorageEvent) => {
			if (e.key === STORAGE_KEY) {
				loadEntries()
			}
		}

		// Listen for custom event (when entry is saved in same tab)
		const handleEntrySaved = () => {
			loadEntries()
		}

		window.addEventListener('storage', handleStorageChange)
		window.addEventListener('entrySaved', handleEntrySaved)
		
		return () => {
			window.removeEventListener('storage', handleStorageChange)
			window.removeEventListener('entrySaved', handleEntrySaved)
		}
	}, [])

	return { entries, refreshEntries: loadEntries }
}

// Helper to save uploaded entry to localStorage
export function saveUploadedEntry(entry: Entry) {
	try {
		const stored = localStorage.getItem(STORAGE_KEY)
		const entries: Entry[] = stored ? JSON.parse(stored) : []
		
		// Check if entry already exists (by id first, then by CID)
		let existingIndex = entries.findIndex((e) => e.id === entry.id)
		if (existingIndex < 0 && entry.cid) {
			existingIndex = entries.findIndex((e) => e.cid === entry.cid)
		}
		if (existingIndex >= 0) {
			entries[existingIndex] = entry
		} else {
			entries.push(entry)
		}

		// Keep only last 50 entries
		const recentEntries = entries.slice(-50)
		localStorage.setItem(STORAGE_KEY, JSON.stringify(recentEntries))
		console.log('[Entries] Saved entry to localStorage:', entry)
		
		// Dispatch custom event to notify other components
		window.dispatchEvent(new Event('entrySaved'))
	} catch (error) {
		console.error('[Entries] Failed to save entry:', error)
	}
}

