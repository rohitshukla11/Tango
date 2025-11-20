'use client'

import { useMemo, useState, useEffect } from 'react'
import { useRealTimeScores } from '@/hooks/useRealTimeScores'

function formatTimeAgo(timestamp?: number) {
	if (!timestamp) return 'just now'
	const delta = Date.now() - timestamp
	if (delta < 1000) return 'just now'
	const seconds = Math.floor(delta / 1000)
	if (seconds < 60) return `${seconds}s ago`
	const minutes = Math.floor(seconds / 60)
	if (minutes < 60) return `${minutes}m ago`
	const hours = Math.floor(minutes / 60)
	return `${hours}h ago`
}

function formatCountdown(timestamp?: number) {
	if (!timestamp) return '—'
	const remaining = timestamp - Date.now()
	if (remaining <= 0) return 'expired'
	const seconds = Math.floor(remaining / 1000)
	if (seconds < 60) return `${seconds}s`
	const minutes = Math.floor(seconds / 60)
	if (minutes < 60) return `${minutes}m`
	const hours = Math.floor(minutes / 60)
	return `${hours}h`
}

function formatAddress(address?: string) {
	if (!address) return '—'
	return `${address.slice(0, 6)}...${address.slice(-4)}`
}

// Generate dummy data for testing
function generateDummyData() {
	const now = Date.now()
	const dummyScores = Array.from({ length: 8 }, (_, i) => ({
		entityKey: `score-${i + 1}`,
		entryId: String(1000 + i),
		score: 5.5 + Math.random() * 4.5,
		scoreScaled: Math.round((5.5 + Math.random() * 4.5) * 100),
		creator: `0x${Math.random().toString(16).slice(2, 42)}`,
		videoCid: `bafybeimock${i + 1}`,
		judges: 3,
		createdAt: now - (i * 30000),
		expiresAt: now + (3600 * 1000),
		raw: {},
	}))

	const dummyBets = Array.from({ length: 12 }, (_, i) => ({
		entityKey: `bet-${i + 1}`,
		entryId: String(1000 + (i % 8)),
		predictor: `0x${Math.random().toString(16).slice(2, 42)}`,
		predictedScore: 5.0 + Math.random() * 5.0,
		stakeWei: String(Math.floor(Math.random() * 1000000000000000) + 100000000000000),
		expiresAt: now + (1800 * 1000) - (i * 60000),
		status: (now + (1800 * 1000) - (i * 60000)) > now ? 'active' as const : 'expired' as const,
		createdAt: now - (i * 45000),
	}))

	const dummyWindows = Array.from({ length: 6 }, (_, i) => ({
		entityKey: `window-${i + 1}`,
		entryId: String(1000 + (i % 8)),
		kind: i % 3 === 0 ? 'prediction' : i % 3 === 1 ? 'voting' : 'staking',
		expiresAt: now + (10800 * 1000) - (i * 300000),
		createdAt: now - (i * 60000),
		windowSeconds: 10800,
	}))

	return { dummyScores, dummyBets, dummyWindows }
}

interface RealTimeFeedProps {
	useDummyData?: boolean
	showFullDetails?: boolean
}

export default function RealTimeFeed({ useDummyData = false, showFullDetails = true }: RealTimeFeedProps) {
	const { scores, bets, windows, status, lastEventTs } = useRealTimeScores({ maxItems: 50 })
	const [dummyData, setDummyData] = useState(generateDummyData())

	// Refresh dummy data every 30 seconds
	useEffect(() => {
		if (!useDummyData) return
		const interval = setInterval(() => {
			setDummyData(generateDummyData())
		}, 30000)
		return () => clearInterval(interval)
	}, [useDummyData])

	const displayScores = useDummyData ? dummyData.dummyScores : scores
	const displayBets = useDummyData ? dummyData.dummyBets : bets
	const displayWindows = useDummyData ? dummyData.dummyWindows : windows

	const activeBets = useMemo(
		() => displayBets.filter((bet) => bet.status === 'active'),
		[displayBets],
	)

	const expiredBets = useMemo(
		() => displayBets.filter((bet) => bet.status === 'expired'),
		[displayBets],
	)

	const expiringWindows = useMemo(
		() => displayWindows.filter((window) => (window.expiresAt ?? 0) > Date.now()),
		[displayWindows],
	)

	const totalStake = useMemo(() => {
		return activeBets.reduce((sum, bet) => {
			return sum + (bet.stakeWei ? Number(bet.stakeWei) : 0)
		}, 0)
	}, [activeBets])

	const avgScore = useMemo(() => {
		if (displayScores.length === 0) return 0
		const sum = displayScores.reduce((acc, s) => acc + s.score, 0)
		return sum / displayScores.length
	}, [displayScores])

	return (
		<section className="brutal-card p-4 sm:p-6 bg-brutal-white border-4 border-brutal-black space-y-6">
			<header className="flex items-center justify-between border-b-4 border-brutal-black pb-3">
				<div>
					<p className="text-xs font-black text-brutal-black/60 uppercase">Arkiv Live</p>
					<h3 className="text-xl sm:text-2xl font-black text-brutal-black">Real-Time Scoring Feed</h3>
				</div>
				<div className="flex items-center gap-2">
					{useDummyData && (
						<span className="px-2 py-1 text-[10px] font-black uppercase border-2 border-brutal-black bg-yellow-200 text-brutal-black">
							DUMMY DATA
						</span>
					)}
					<span
						className={`px-3 py-1 text-xs font-black uppercase border-2 border-brutal-black rounded-full ${
							status === 'open' ? 'bg-green-300 text-brutal-black' : 'bg-argentina-yellow'
						}`}
					>
						{status === 'open' ? 'LIVE' : 'RECONNECTING'}
					</span>
				</div>
			</header>

			{/* Stats Overview */}
			{showFullDetails && (
				<div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-4 border-brutal-black p-3 bg-argentina-blue/10">
					<div className="text-center">
						<p className="text-xs font-black text-brutal-black/60 uppercase">Total Scores</p>
						<p className="text-2xl font-black text-brutal-black">{displayScores.length}</p>
					</div>
					<div className="text-center">
						<p className="text-xs font-black text-brutal-black/60 uppercase">Avg Score</p>
						<p className="text-2xl font-black text-brutal-black">{avgScore.toFixed(2)}</p>
					</div>
					<div className="text-center">
						<p className="text-xs font-black text-brutal-black/60 uppercase">Active Bets</p>
						<p className="text-2xl font-black text-brutal-black">{activeBets.length}</p>
					</div>
					<div className="text-center">
						<p className="text-xs font-black text-brutal-black/60 uppercase">Total Stake</p>
						<p className="text-lg font-black text-brutal-black">
							{(totalStake / 1e18).toFixed(4)} ETH
						</p>
					</div>
				</div>
			)}

			{/* Scores Section */}
			<div className="space-y-3">
				<div className="flex items-center justify-between border-b-2 border-brutal-black pb-2">
					<p className="text-sm font-black text-brutal-black uppercase">Recent Scores</p>
					<span className="text-xs font-bold text-brutal-black/60">{displayScores.length} total</span>
				</div>
				{displayScores.length === 0 && (
					<p className="text-sm font-bold text-brutal-black/60 p-4 text-center">No scores yet—run the AI judge!</p>
				)}
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{displayScores.slice(0, showFullDetails ? 12 : 4).map((score) => (
						<div
							key={score.entityKey}
							className="p-4 border-4 border-brutal-black bg-argentina-blue/10 hover:bg-argentina-blue/20 transition-colors"
						>
							<div className="flex items-center justify-between text-sm font-black text-brutal-black mb-2">
								<span>Entry #{score.entryId}</span>
								<span className="text-xs">{formatTimeAgo(score.createdAt)}</span>
							</div>
							<div className="flex items-center justify-between mb-2">
								<div className="text-3xl font-black text-brutal-black">
									{score.score.toFixed(2)}
									<span className="text-base text-brutal-black/60"> /10</span>
								</div>
								<div className="text-xs font-bold text-brutal-black/70">
									👩‍⚖️ {score.judges ?? 0} judges
								</div>
							</div>
							{showFullDetails && (
								<div className="space-y-1 mt-2 pt-2 border-t-2 border-brutal-black/30">
									<div className="flex justify-between text-xs">
										<span className="font-bold text-brutal-black/60">Creator:</span>
										<span className="font-mono text-brutal-black">{formatAddress(score.creator)}</span>
									</div>
									<div className="flex justify-between text-xs">
										<span className="font-bold text-brutal-black/60">Scaled:</span>
										<span className="font-black text-brutal-black">{score.scoreScaled ?? '—'}</span>
									</div>
									<div className="flex justify-between text-xs">
										<span className="font-bold text-brutal-black/60">CID:</span>
										<span className="font-mono text-brutal-black truncate">{score.videoCid?.slice(0, 12)}...</span>
									</div>
									{score.expiresAt && (
										<div className="flex justify-between text-xs">
											<span className="font-bold text-brutal-black/60">Expires:</span>
											<span className="font-black text-brutal-black">{formatCountdown(score.expiresAt)}</span>
										</div>
									)}
								</div>
							)}
						</div>
					))}
				</div>
			</div>

			{/* Bets Section */}
			<div className="space-y-3">
				<div className="flex items-center justify-between border-b-2 border-brutal-black pb-2">
					<p className="text-sm font-black text-brutal-black uppercase">Active Predictions</p>
					<span className="text-xs font-bold text-brutal-black/60">
						{activeBets.length} active, {expiredBets.length} expired
					</span>
				</div>
				{activeBets.length === 0 && (
					<p className="text-sm font-bold text-brutal-black/60 p-4 text-center">No live predictions right now.</p>
				)}
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{activeBets.slice(0, showFullDetails ? 12 : 4).map((bet) => (
						<div
							key={bet.entityKey}
							className="p-4 border-4 border-brutal-black bg-argentina-yellow/20 hover:bg-argentina-yellow/30 transition-colors"
						>
							<div className="flex items-center justify-between text-sm font-black text-brutal-black mb-2">
								<span>Entry #{bet.entryId}</span>
								<span className="text-xs">⏱ {formatCountdown(bet.expiresAt)}</span>
							</div>
							<div className="flex items-center justify-between mb-2">
								<div className="text-2xl font-black text-brutal-black">
									{bet.predictedScore?.toFixed(2) ?? '—'}
									<span className="text-base text-brutal-black/60"> /10</span>
								</div>
								<div className="text-xs font-mono text-brutal-black/70">
									{bet.stakeWei ? `${(Number(bet.stakeWei) / 1e18).toFixed(4)} ETH` : '—'}
								</div>
							</div>
							{showFullDetails && (
								<div className="space-y-1 mt-2 pt-2 border-t-2 border-brutal-black/30">
									<div className="flex justify-between text-xs">
										<span className="font-bold text-brutal-black/60">Predictor:</span>
										<span className="font-mono text-brutal-black">{formatAddress(bet.predictor)}</span>
									</div>
									<div className="flex justify-between text-xs">
										<span className="font-bold text-brutal-black/60">Stake (wei):</span>
										<span className="font-mono text-brutal-black">{bet.stakeWei ?? '0'}</span>
									</div>
									<div className="flex justify-between text-xs">
										<span className="font-bold text-brutal-black/60">Status:</span>
										<span
											className={`font-black uppercase ${
												bet.status === 'active' ? 'text-green-700' : 'text-red-700'
											}`}
										>
											{bet.status}
										</span>
									</div>
									{bet.createdAt && (
										<div className="flex justify-between text-xs">
											<span className="font-bold text-brutal-black/60">Created:</span>
											<span className="font-black text-brutal-black">{formatTimeAgo(bet.createdAt)}</span>
										</div>
									)}
								</div>
							)}
						</div>
					))}
				</div>
			</div>

			{/* Voting Windows Section */}
			{showFullDetails && (
				<div className="space-y-3 border-t-4 border-brutal-black pt-4">
					<div className="flex items-center justify-between border-b-2 border-brutal-black pb-2">
						<p className="text-sm font-black text-brutal-black uppercase">Voting Windows</p>
						<span className="text-xs font-bold text-brutal-black/60">
							{expiringWindows.length} active, {displayWindows.length - expiringWindows.length} expired
						</span>
					</div>
					<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
						{displayWindows.slice(0, 9).map((window) => (
							<div
								key={window.entityKey}
								className="p-3 border-4 border-brutal-black bg-brutal-white hover:bg-argentina-blue/10 transition-colors"
							>
								<div className="flex items-center justify-between text-sm font-black text-brutal-black mb-2">
									<span>Entry #{window.entryId}</span>
									<span
										className={`text-xs px-2 py-1 border-2 border-brutal-black ${
											(window.expiresAt ?? 0) > Date.now()
												? 'bg-green-200 text-brutal-black'
												: 'bg-red-200 text-brutal-black'
										}`}
									>
										{(window.expiresAt ?? 0) > Date.now() ? 'ACTIVE' : 'EXPIRED'}
									</span>
								</div>
								<div className="space-y-1 text-xs">
									<div className="flex justify-between">
										<span className="font-bold text-brutal-black/60">Type:</span>
										<span className="font-black text-brutal-black uppercase">{window.kind ?? 'unknown'}</span>
									</div>
									<div className="flex justify-between">
										<span className="font-bold text-brutal-black/60">Duration:</span>
										<span className="font-black text-brutal-black">
											{window.windowSeconds ? `${Math.floor(window.windowSeconds / 60)}m` : '—'}
										</span>
									</div>
									<div className="flex justify-between">
										<span className="font-bold text-brutal-black/60">Expires:</span>
										<span className="font-black text-brutal-black">{formatCountdown(window.expiresAt)}</span>
									</div>
									{window.createdAt && (
										<div className="flex justify-between">
											<span className="font-bold text-brutal-black/60">Created:</span>
											<span className="font-black text-brutal-black">{formatTimeAgo(window.createdAt)}</span>
										</div>
									)}
								</div>
							</div>
						))}
					</div>
				</div>
			)}

			{/* Connection Status Footer */}
			{showFullDetails && (
				<div className="border-t-4 border-brutal-black pt-3 flex items-center justify-between text-xs">
					<div className="flex items-center gap-2">
						<span className="font-bold text-brutal-black/60">Last Event:</span>
						<span className="font-black text-brutal-black">
							{lastEventTs ? formatTimeAgo(lastEventTs) : 'Never'}
						</span>
					</div>
					<div className="flex items-center gap-2">
						<span className="font-bold text-brutal-black/60">Connection:</span>
						<span
							className={`font-black uppercase ${
								status === 'open' ? 'text-green-700' : status === 'connecting' ? 'text-yellow-700' : 'text-red-700'
							}`}
						>
							{status}
						</span>
					</div>
				</div>
			)}
		</section>
	)
}
