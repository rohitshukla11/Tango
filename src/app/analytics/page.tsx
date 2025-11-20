'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface LeaderboardRow {
	entryId: string
	score: number
	creator?: string
	judges?: number
}

interface CreatorRow {
	creator: string
	entries: number
	avgScore: number
	bestScore: number
	lastScoreAt: number
}

interface BetRow {
	entityKey: string
	entryId: string
	predictor?: string
	predictedScore?: number
	stakeWei?: string
	expiresAt?: number
	status: 'active' | 'expired'
}

interface LeaderboardResponse {
	updatedAt: number
	leaderboard: LeaderboardRow[]
	creatorAnalytics: CreatorRow[]
	bets: {
		total: number
		active: number
		expired: number
		expiringSoon: number
		uniquePredictors: number
		totalStakeWei: string
		avgPrediction: number
		records: BetRow[]
	}
	windows: {
		total: number
		active: number
		expired: number
		items: Array<{ entryId: string; kind?: string; expiresAt?: number }>
	}
}

function formatDate(value?: number) {
	if (!value) return '—'
	return new Date(value).toLocaleString()
}

export default function AnalyticsPage() {
	const [data, setData] = useState<LeaderboardResponse | null>(null)
	const [loading, setLoading] = useState(true)

	useEffect(() => {
		let mounted = true
		async function load() {
			setLoading(true)
			try {
				const res = await fetch('/api/arkiv/leaderboard')
				if (!res.ok) throw new Error(await res.text())
				const json = (await res.json()) as LeaderboardResponse
				if (mounted) setData(json)
			} catch (error) {
				console.error('[Analytics] Failed to load Arkiv analytics:', error)
			} finally {
				if (mounted) setLoading(false)
			}
		}
		load()
		const interval = setInterval(load, 15000)
		return () => {
			mounted = false
			clearInterval(interval)
		}
	}, [])

	return (
		<div className="min-h-screen bg-brutal-cream">
			<header className="bg-argentina-blue border-b-4 border-brutal-black shadow-brutal">
				<div className="max-w-6xl mx-auto px-4 py-5 flex items-center justify-between">
					<Link href="/" className="text-2xl font-black text-brutal-black">
						TANGO<span className="text-argentina-yellow">.FUN</span>
					</Link>
					<h1 className="text-xl sm:text-3xl font-black text-brutal-black">Arkiv Analytics</h1>
				</div>
			</header>

			<main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
				{loading && (
					<div className="brutal-card p-4 border-4 border-brutal-black text-center font-black text-brutal-black">
						Loading Arkiv data...
					</div>
				)}

				{data && (
					<>
						<section className="grid gap-4 sm:grid-cols-3">
							<div className="brutal-card p-4 border-4 border-brutal-black bg-brutal-white">
								<p className="text-xs font-black text-brutal-black/60 uppercase">Leaderboard entries</p>
								<p className="text-4xl font-black text-brutal-black">{data.leaderboard.length}</p>
								<p className="text-xs font-bold text-brutal-black/60 mt-2">
									Last updated: {formatDate(data.updatedAt)}
								</p>
							</div>
							<div className="brutal-card p-4 border-4 border-brutal-black bg-brutal-white">
								<p className="text-xs font-black text-brutal-black/60 uppercase">Active Bets</p>
								<p className="text-4xl font-black text-brutal-black">{data.bets.active}</p>
								<p className="text-xs font-bold text-brutal-black/60 mt-2">
									Expiring Soon: {data.bets.expiringSoon}
								</p>
							</div>
							<div className="brutal-card p-4 border-4 border-brutal-black bg-brutal-white">
								<p className="text-xs font-black text-brutal-black/60 uppercase">Voting Windows</p>
								<p className="text-4xl font-black text-brutal-black">{data.windows.active}</p>
								<p className="text-xs font-bold text-brutal-black/60 mt-2">
									Expired: {data.windows.expired}
								</p>
							</div>
						</section>

						<section className="brutal-card p-4 border-4 border-brutal-black bg-brutal-white">
							<h2 className="text-xl font-black text-brutal-black mb-3">Creator Leaderboard</h2>
							<div className="overflow-x-auto">
								<table className="w-full text-sm">
									<thead>
										<tr className="text-left uppercase text-xs font-black text-brutal-black/60">
											<th className="py-2">Creator</th>
											<th>Entries</th>
											<th>Avg Score</th>
											<th>Best Score</th>
											<th>Last Update</th>
										</tr>
									</thead>
									<tbody>
										{data.creatorAnalytics.map((creator) => (
											<tr key={creator.creator} className="border-t border-brutal-black/20">
												<td className="py-2 font-mono text-xs">{creator.creator}</td>
												<td>{creator.entries}</td>
												<td>{creator.avgScore.toFixed(2)}</td>
												<td>{creator.bestScore.toFixed(2)}</td>
												<td>{formatDate(creator.lastScoreAt)}</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</section>

						<section className="brutal-card p-4 border-4 border-brutal-black bg-brutal-white">
							<h2 className="text-xl font-black text-brutal-black mb-3">Live Bets</h2>
							<div className="overflow-x-auto">
								<table className="w-full text-sm">
									<thead>
										<tr className="text-left uppercase text-xs font-black text-brutal-black/60">
											<th>Entry</th>
											<th>Predictor</th>
											<th>Prediction</th>
											<th>Stake (wei)</th>
											<th>Status</th>
											<th>Expires</th>
										</tr>
									</thead>
									<tbody>
										{data.bets.records.map((bet) => (
											<tr key={bet.entityKey} className="border-t border-brutal-black/20">
												<td className="py-2 font-black text-brutal-black">{bet.entryId}</td>
												<td className="font-mono text-xs">{bet.predictor ?? '—'}</td>
												<td>{bet.predictedScore?.toFixed(2) ?? '—'}</td>
												<td className="font-mono text-xs">{bet.stakeWei ?? '0'}</td>
												<td>
													<span
														className={`px-2 py-1 text-[10px] font-black uppercase border-2 border-brutal-black ${
															bet.status === 'active' ? 'bg-green-200' : 'bg-red-200'
														}`}
													>
														{bet.status}
													</span>
												</td>
												<td>{formatDate(bet.expiresAt)}</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</section>
					</>
				)}
			</main>
		</div>
	)
}

