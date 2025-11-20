'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import RealTimeFeed from '@/components/RealTimeFeed'

export default function LiveFeedPage() {
	const [useDummyData, setUseDummyData] = useState(true)

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
				{/* Page Title & Controls */}
				<div className="mb-6 sm:mb-8 space-y-4">
					<div className="text-center">
						<h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-brutal-black mb-2 transform rotate-1">
							📡 LIVE FEED
						</h1>
						<p className="text-base sm:text-lg font-bold text-brutal-black/70">
							Real-time scoring, predictions, and voting windows from Arkiv
						</p>
					</div>

					{/* Toggle Dummy Data */}
					<div className="flex items-center justify-center gap-3">
						<label className="flex items-center gap-2 cursor-pointer">
							<input
								type="checkbox"
								checked={useDummyData}
								onChange={(e) => setUseDummyData(e.target.checked)}
								className="w-5 h-5 border-4 border-brutal-black accent-argentina-yellow cursor-pointer"
							/>
							<span className="text-sm font-black text-brutal-black uppercase">
								Use Dummy Data (for testing)
							</span>
						</label>
					</div>
				</div>

				{/* Real-Time Feed Component */}
				<RealTimeFeed useDummyData={useDummyData} showFullDetails={true} />

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
			</main>
		</div>
	)
}

