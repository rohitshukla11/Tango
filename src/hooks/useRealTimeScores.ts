'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

export interface ArkivScoreEvent {
	entityKey: string
	entryId: string
	score: number
	scoreScaled?: number
	creator?: string
	videoCid?: string
	judges?: number
	createdAt?: number
	expiresAt?: number
	raw?: unknown
}

export interface ArkivBetEvent {
	entityKey: string
	entryId: string
	predictor?: string
	predictedScore?: number
	stakeWei?: string
	expiresAt?: number
	status: 'active' | 'expired'
	createdAt?: number
}

export interface ArkivWindowEvent {
	entityKey: string
	entryId: string
	kind?: string
	expiresAt?: number
	createdAt?: number
	windowSeconds?: number
}

interface UseRealTimeScoresOptions {
	types?: string[]
	maxItems?: number
}

const DEFAULT_TYPES =
	(process.env.NEXT_PUBLIC_ARKIV_REALTIME_TYPES?.split(',').map((v) => v.trim()).filter(Boolean)) ?? [
		'score',
		'bet',
		'window',
	]

export function useRealTimeScores(options: UseRealTimeScoresOptions = {}) {
	const { types = DEFAULT_TYPES, maxItems = 25 } = options
	const [scores, setScores] = useState<ArkivScoreEvent[]>([])
	const [bets, setBets] = useState<ArkivBetEvent[]>([])
	const [windows, setWindows] = useState<ArkivWindowEvent[]>([])
	const [status, setStatus] = useState<'connecting' | 'open' | 'closed'>('connecting')
	const [lastEventTs, setLastEventTs] = useState<number | null>(null)
	const eventSourceRef = useRef<EventSource | null>(null)

	const typeParam = useMemo(() => types.join(','), [types])

	useEffect(() => {
		const params = new URLSearchParams()
		if (typeParam) {
			params.set('types', typeParam)
		}

		const url = `/api/arkiv/stream?${params.toString()}`
		const source = new EventSource(url)
		eventSourceRef.current = source

		const upsertScore = (event: MessageEvent) => {
			try {
				const data = JSON.parse(event.data)
				const newScore: ArkivScoreEvent = {
					entityKey: data.entityKey,
					entryId: data.attributes?.entryId ?? data.payload?.entryId ?? 'unknown',
					score: Number(data.attributes?.score ?? data.payload?.aiScore ?? 0),
					scoreScaled: Number(data.attributes?.scoreScaled ?? data.payload?.aiScoreScaled ?? 0),
					creator: data.attributes?.creator ?? data.payload?.creator,
					videoCid: data.attributes?.videoCid ?? data.payload?.videoCid,
					judges: data.payload?.judges?.length ?? data.attributes?.judgesCount ?? 0,
					createdAt: data.createdAt ?? Date.now(),
					expiresAt: data.expiresAt,
					raw: data,
				}
				setScores((prev) => {
					const filtered = prev.filter((item) => item.entityKey !== newScore.entityKey)
					return [newScore, ...filtered].slice(0, maxItems)
				})
			} catch (err) {
				console.warn('[useRealTimeScores] Failed to parse score event:', err)
			}
		}

		const upsertBet = (event: MessageEvent) => {
			try {
				const data = JSON.parse(event.data)
				const expiresAt = data.expiresAt ?? data.payload?.expiresAt
				const newBet: ArkivBetEvent = {
					entityKey: data.entityKey,
					entryId: data.attributes?.entryId ?? data.payload?.entryId ?? 'unknown',
					predictor: data.attributes?.predictor ?? data.payload?.predictor,
					predictedScore: Number(data.attributes?.predictedScore ?? data.payload?.predictedScore ?? 0),
					stakeWei: data.attributes?.stakeWei ?? data.payload?.stakeWei,
					expiresAt,
					status: expiresAt && expiresAt < Date.now() ? 'expired' : 'active',
					createdAt: data.createdAt,
				}
				setBets((prev) => {
					const filtered = prev.filter((item) => item.entityKey !== newBet.entityKey)
					return [newBet, ...filtered].slice(0, maxItems)
				})
			} catch (err) {
				console.warn('[useRealTimeScores] Failed to parse bet event:', err)
			}
		}

		const upsertWindow = (event: MessageEvent) => {
			try {
				const data = JSON.parse(event.data)
				const newWindow: ArkivWindowEvent = {
					entityKey: data.entityKey,
					entryId: data.attributes?.entryId ?? data.payload?.entryId ?? 'unknown',
					kind: data.attributes?.kind ?? data.payload?.kind,
					expiresAt: data.expiresAt ?? data.payload?.expiresAt,
					createdAt: data.createdAt,
					windowSeconds: Number(data.payload?.windowSeconds ?? data.attributes?.windowSeconds ?? 0),
				}
				setWindows((prev) => {
					const filtered = prev.filter((item) => item.entityKey !== newWindow.entityKey)
					return [newWindow, ...filtered].slice(0, maxItems)
				})
			} catch (err) {
				console.warn('[useRealTimeScores] Failed to parse window event:', err)
			}
		}

		source.addEventListener('score', upsertScore)
		source.addEventListener('bet', upsertBet)
		source.addEventListener('window', upsertWindow)
		source.addEventListener('ttl', (evt) => {
			try {
				const data = JSON.parse(evt.data)
				setBets((prev) =>
					prev.map((bet) =>
						bet.entityKey === data.entityKey
							? {
									...bet,
									status: data.newExpirationBlock ? bet.status : bet.status,
							  }
							: bet,
					),
				)
			} catch {
				// ignore
			}
		})

		source.onopen = () => {
			setStatus('open')
		}
		source.onerror = () => {
			setStatus('closed')
		}
		source.onmessage = (event) => {
			setLastEventTs(Date.now())
			if (!event.data) return
			try {
				const data = JSON.parse(event.data)
				if (data?.type === 'score') {
					upsertScore(event)
				}
			} catch {
				// swallow
			}
		}

		return () => {
			source.close()
			eventSourceRef.current = null
		}
	}, [typeParam, maxItems])

	return {
		scores,
		bets,
		windows,
		status,
		lastEventTs,
		eventSource: eventSourceRef.current,
	}
}

