'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import RealTimeFeed from '@/components/RealTimeFeed'

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

export default function LiveFeedPage() {
	const [activeTab, setActiveTab] = useState<'live' | 'analytics'>('live')
	const [analyticsData, setAnalyticsData] = useState<LeaderboardResponse | null>(null)
	const [analyticsLoading, setAnalyticsLoading] = useState(false)

	const loadAnalytics = async () => {
		setAnalyticsLoading(true)
		try {
			const res = await fetch('/api/arkiv/leaderboard')
			if (!res.ok) throw new Error(await res.text())
			const json = (await res.json()) as LeaderboardResponse
			setAnalyticsData(json)
		} catch (error) {
			console.error('[Analytics] Failed to load Arkiv analytics:', error)
		} finally {
			setAnalyticsLoading(false)
		}
	}

	useEffect(() => {
		if (activeTab === 'analytics') {
			loadAnalytics()
			const interval = setInterval(loadAnalytics, 15000)
			return () => clearInterval(interval)
		}
	}, [activeTab])

	return (
		<div className="min-h-screen bg-brutal-cream">
			{/* Header */}
			<header className="sticky top-0 z-50 bg-argentina-blue border-b-4 border-brutal-black shadow-brutal">
				<div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 sm:py-5">
					<div className="flex items-center justify-between">
						<Link
							href="/"
							className="text-2xl sm:text-3xl md:text-4xl font-black text-brutal-black tracking-tighter transform -rotate-1"
						>
							TANGO<span className="text-argentina-yellow">.FUN</span>
						</Link>
						<div className="flex items-center gap-2 sm:gap-3">
							<Link
								href="/"
								className="brutal-btn px-3 py-2 sm:px-6 sm:py-3 text-xs sm:text-base"
							>
								<span className="hidden sm:inline">← HOME</span>
								<span className="sm:hidden">←</span>
							</Link>
							<div className="wallet-connect-wrapper">
								<ConnectButton />
							</div>
						</div>
					</div>
				</div>
			</header>

			{/* Main Content */}
			<main className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
				{/* Page Title & Tabs */}
				<div className="mb-6 sm:mb-8 space-y-4">
					<div className="text-center">
						<h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-brutal-black mb-2 transform rotate-1">
							📡 LIVE & ANALYTICS
						</h1>
						<p className="text-base sm:text-lg font-bold text-brutal-black/70">
							Real-time scoring feed and comprehensive analytics from Arkiv
						</p>
					</div>

					{/* Tabs */}
					<div className="flex gap-2 sm:gap-3 justify-center">
						<button
							onClick={() => setActiveTab('live')}
							className={`px-4 sm:px-6 py-2 sm:py-3 font-black text-xs sm:text-sm uppercase border-4 border-brutal-black transition-all ${
								activeTab === 'live'
									? 'bg-argentina-yellow text-brutal-black shadow-brutal-sm transform translate-x-[2px] translate-y-[2px]'
									: 'bg-brutal-white text-brutal-black shadow-brutal hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-brutal-sm'
							}`}
						>
							📡 Live Feed
						</button>
						<button
							onClick={() => setActiveTab('analytics')}
							className={`px-4 sm:px-6 py-2 sm:py-3 font-black text-xs sm:text-sm uppercase border-4 border-brutal-black transition-all ${
								activeTab === 'analytics'
									? 'bg-argentina-yellow text-brutal-black shadow-brutal-sm transform translate-x-[2px] translate-y-[2px]'
									: 'bg-brutal-white text-brutal-black shadow-brutal hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-brutal-sm'
							}`}
						>
							📊 Analytics
						</button>
					</div>

				</div>

				{/* Tab Content */}
				{activeTab === 'live' ? (
					<>
						{/* Real-Time Feed Component */}
						<RealTimeFeed useDummyData={false} showFullDetails={true} />

						{/* Info Section */}
						<div className="mt-6 brutal-card p-4 sm:p-6 bg-brutal-white border-4 border-brutal-black">
							<h2 className="text-lg sm:text-xl font-black text-brutal-black mb-3 uppercase">
								ℹ️ About This Feed
							</h2>
							<div className="space-y-2 text-sm font-bold text-brutal-black/80">
								<p>
									<strong>Real-Time Scoring:</strong> Live updates as AI judges score entries. Each score includes
									judge count, creator address, and expiration time.
								</p>
								<p>
									<strong>Active Predictions:</strong> Current bets with predicted scores, stake amounts, and time
									until expiration. Stakes are shown in ETH.
								</p>
								<p>
									<strong>Voting Windows:</strong> Time-bounded windows for predictions, voting, and staking.
									Windows automatically expire based on TTL settings.
								</p>
								<p className="text-xs font-bold text-brutal-black/60 mt-4">
									Powered by Arkiv DB-Chain (Mendoza testnet). Data is indexed in real-time using Arkiv's
									subscription API.
								</p>
							</div>
						</div>
					</>
				) : (
					<>
						{analyticsLoading && (
							<div className="brutal-card p-4 border-4 border-brutal-black text-center font-black text-brutal-black">
								Loading Arkiv data...
							</div>
						)}

						{analyticsData && (
							<div className="space-y-6">
								{/* Stats Cards */}
								<section className="grid gap-4 sm:grid-cols-3">
									<div className="brutal-card p-4 border-4 border-brutal-black bg-brutal-white">
										<p className="text-xs font-black text-brutal-black/60 uppercase">Leaderboard entries</p>
										<p className="text-4xl font-black text-brutal-black">{analyticsData.leaderboard.length}</p>
										<p className="text-xs font-bold text-brutal-black/60 mt-2">
											Last updated: {formatDate(analyticsData.updatedAt)}
										</p>
									</div>
									<div className="brutal-card p-4 border-4 border-brutal-black bg-brutal-white">
										<p className="text-xs font-black text-brutal-black/60 uppercase">Active Bets</p>
										<p className="text-4xl font-black text-brutal-black">{analyticsData.bets.active}</p>
										<p className="text-xs font-bold text-brutal-black/60 mt-2">
											Expiring Soon: {analyticsData.bets.expiringSoon}
										</p>
									</div>
									<div className="brutal-card p-4 border-4 border-brutal-black bg-brutal-white">
										<p className="text-xs font-black text-brutal-black/60 uppercase">Voting Windows</p>
										<p className="text-4xl font-black text-brutal-black">{analyticsData.windows.active}</p>
										<p className="text-xs font-bold text-brutal-black/60 mt-2">
											Expired: {analyticsData.windows.expired}
										</p>
									</div>
								</section>

								{/* Creator Leaderboard */}
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
												{analyticsData.creatorAnalytics.map((creator) => (
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

								{/* Live Bets */}
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
												{analyticsData.bets.records.map((bet) => (
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
							</div>
						)}
					</>
				)}
			</main>
		</div>
	)
}
