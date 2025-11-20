'use client'

import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useBlockNumber } from 'wagmi'
import { scrollSepolia } from 'wagmi/chains'
import VideoCard from '@/components/VideoCard'
import { useEntries, saveUploadedEntry, type AIJudgeResult, type Entry, type PredictionResult } from '@/hooks/useEntries'
import { useScrollPrediction } from '@/hooks/useScrollPrediction'
import { ethers } from 'ethers'

export default function Home() {
  const [activeTab, setActiveTab] = useState<'trending' | 'recent' | 'finalized'>('trending')
  const { entries, refreshEntries } = useEntries()
  const { data: currentBlock } = useBlockNumber({ 
    chainId: scrollSepolia.id,
    watch: true 
  })
  const { revealPrediction, getSettlementResults } = useScrollPrediction()
  const [revealing, setRevealing] = useState<string | null>(null)

  const formatEth = (wei?: string) => {
    if (!wei) return '—'
    try {
      const formatted = ethers.formatUnits(wei, 18)
      const numeric = Number(formatted)
      if (Number.isNaN(numeric)) return formatted
      return numeric.toFixed(4)
    } catch {
      return '—'
    }
  }

  const handleReveal = async (entry: Entry) => {
    if (!entry.predictionResult || revealing === entry.id) return

    const unlockBlock = BigInt(entry.predictionResult.unlockBlock)
    const isUnlocked = currentBlock && currentBlock >= unlockBlock
    const hasRevealed = Boolean(entry.predictionResult.revealedAt || entry.predictionResult.settledAt)

    if (!isUnlocked || hasRevealed) return

    const numericId = Number(entry.id)
    if (!Number.isFinite(numericId)) {
      console.error('[Home] Invalid entry id for reveal:', entry.id)
      return
    }

    if (!entry.predictionResult.salt) {
      console.error('[Home] Missing salt for reveal:', entry.id)
      return
    }

    try {
      setRevealing(entry.id)
      console.log('[Home] Revealing prediction for entry', entry.id)
      await revealPrediction(numericId, entry.predictionResult.predictedScore, entry.predictionResult.salt)

      // Wait a bit for the transaction to be mined
      await new Promise(resolve => setTimeout(resolve, 2000))

      // Fetch settlement results from contract
      const originalStakeWei = entry.predictionResult?.stakeWei || '0'
      const settlementResults = await getSettlementResults(numericId, originalStakeWei)
      const stakeWeiBigInt = BigInt(originalStakeWei || '0')
      let updatedPrediction: PredictionResult | null = null

      if (settlementResults) {
        const { aiScoreScaled, predictedScoreScaled, diff, payoutWei } = settlementResults
        const win = payoutWei >= stakeWeiBigInt && payoutWei > BigInt(0)

        updatedPrediction = {
          ...entry.predictionResult,
          revealedAt: Date.now(),
          settledAt: Date.now(),
          payoutWei: payoutWei.toString(),
          aiScoreScaled,
          predictedScoreScaled,
          diff,
          result: win ? 'won' : 'lost',
        }
        console.log('[Home] Settlement results saved:', settlementResults)
      } else {
        // Fallback: estimate based on local data (matches contract payout logic)
        const aiScore = entry.aiScore
        const predictedScore = entry.predictionResult?.predictedScore

        if (typeof aiScore === 'number' && typeof predictedScore === 'number') {
          const aiScoreScaled = Math.round(aiScore * 100)
          const predictedScoreScaled = Math.round(predictedScore * 100)
          const diff = Math.abs(predictedScoreScaled - aiScoreScaled)

          let payoutWei = BigInt(0)
          if (diff === 0) {
            payoutWei = stakeWeiBigInt * BigInt(200) / BigInt(100)
          } else if (diff <= 25) {
            payoutWei = stakeWeiBigInt * BigInt(50) / BigInt(100)
          } else if (diff <= 50) {
            payoutWei = stakeWeiBigInt * BigInt(25) / BigInt(100)
          }

          const win = payoutWei >= stakeWeiBigInt && payoutWei > BigInt(0)

          updatedPrediction = {
            ...entry.predictionResult,
            revealedAt: Date.now(),
            settledAt: Date.now(),
            payoutWei: payoutWei.toString(),
            aiScoreScaled,
            predictedScoreScaled,
            diff,
            result: win ? 'won' : 'lost',
          }

          console.log('[Home] Settlement results (fallback) computed locally:', {
            aiScoreScaled,
            predictedScoreScaled,
            diff,
            payoutWei: payoutWei.toString(),
          })
        } else {
          console.warn('[Home] Settlement results unavailable; only reveal timestamp recorded.')
          updatedPrediction = {
            ...entry.predictionResult,
            revealedAt: Date.now(),
            settledAt: Date.now(),
          }
        }
      }

      if (updatedPrediction) {
        const updatedEntry: Entry = {
          ...entry,
          status: 'finalized',
          predictionResult: updatedPrediction,
        }

        saveUploadedEntry(updatedEntry)
        refreshEntries()
      }
    } catch (error) {
      console.error('[Home] Reveal failed:', error)
    } finally {
      setRevealing(null)
    }
  }

  // Filter entries - show only the latest one
  const filteredEntries = useMemo(() => {
    let filtered: typeof entries = []
    
    switch (activeTab) {
      case 'finalized':
        filtered = entries.filter((e) => e.status === 'finalized')
        break
      case 'trending':
      case 'recent':
      default:
        filtered = entries.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        break
    }
    
    // Only show the latest entry
    return filtered.slice(0, 1)
  }, [entries, activeTab])

  // Don't auto-load AI score - only show after clicking judge button
  // useEffect removed - AI score will only be set when judge button is clicked

  return (
    <div className="min-h-screen bg-brutal-cream">
      {/* Header - Neo-Brutalism Style */}
      <header className="sticky top-0 z-50 bg-argentina-blue border-b-4 border-brutal-black shadow-brutal">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 sm:py-5">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-brutal-black tracking-tighter transform -rotate-1">
              TANGO<span className="text-argentina-yellow">.FUN</span>
            </h1>
            <div className="flex items-center gap-2 sm:gap-3">
              <Link
                href="/upload"
                className="brutal-btn-yellow px-3 py-2 sm:px-6 sm:py-3 text-xs sm:text-base"
              >
                <span className="hidden sm:inline">+ UPLOAD</span>
                <span className="sm:hidden">+</span>
              </Link>
              <div className="wallet-connect-wrapper">
                <ConnectButton />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Feed - TikTok/Instagram Style */}
      <main className="max-w-xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {/* Live Feed Link */}
        <Link
          href="/live"
          className="block brutal-card p-4 sm:p-6 bg-argentina-blue border-4 border-brutal-black hover:bg-argentina-yellow transition-colors group"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-black text-brutal-black/60 uppercase mb-1">Arkiv Live</p>
              <h3 className="text-lg sm:text-xl font-black text-brutal-black">Real-Time Scoring Feed</h3>
              <p className="text-xs sm:text-sm font-bold text-brutal-black/70 mt-1">
                View live scores, predictions, and voting windows →
              </p>
            </div>
            <span className="px-3 py-1 text-xs font-black uppercase border-2 border-brutal-black rounded-full bg-green-300 text-brutal-black group-hover:bg-brutal-black group-hover:text-argentina-yellow transition-colors">
              LIVE
            </span>
          </div>
        </Link>

        {/* Tabs - Chunky Style */}
        <div className="flex gap-2 sm:gap-3 mb-4 sm:mb-6">
          {(['trending', 'recent', 'finalized'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 sm:py-3 px-2 sm:px-4 font-black text-[10px] sm:text-xs uppercase tracking-wider border-4 border-brutal-black transition-all ${
                activeTab === tab
                  ? 'bg-argentina-yellow text-brutal-black shadow-brutal-sm transform translate-x-[2px] translate-y-[2px]'
                  : 'bg-brutal-white text-brutal-black shadow-brutal hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-brutal-sm'
              }`}
            >
              <span className="block sm:inline">
                {tab === 'trending' && '🔥'}
                {tab === 'recent' && '⏰'}
                {tab === 'finalized' && '✅'}
              </span>
              <span className="hidden sm:inline"> {tab}</span>
              <span className="block sm:hidden text-[8px] mt-0.5">{tab}</span>
            </button>
          ))}
        </div>

        {/* Feed Posts */}
        {filteredEntries.length > 0 ? (
          <div className="space-y-4 sm:space-y-6">
            {filteredEntries.map((entry) => (
              <article key={entry.id} className="feed-card overflow-hidden">
                {/* Post Header */}
                <div className="p-3 sm:p-4 bg-argentina-blue border-b-4 border-brutal-black flex items-center justify-between">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-brutal-black border-4 border-brutal-black flex items-center justify-center text-argentina-yellow font-black text-base sm:text-lg transform rotate-3">
                      {entry.creator.slice(2, 4).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-black text-brutal-black text-sm sm:text-base">Entry #{entry.id}</p>
                      <p className="text-[10px] sm:text-xs font-bold text-brutal-black/70">{entry.creator.slice(0, 6)}...{entry.creator.slice(-4)}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs font-black border-4 border-brutal-black shadow-brutal-sm ${
                    entry.status === 'finalized' ? 'bg-green-400 text-brutal-black' :
                    entry.status === 'judged' ? 'bg-argentina-yellow text-brutal-black' :
                    'bg-brutal-white text-brutal-black'
                  }`}>
                    {entry.status.toUpperCase()}
                  </span>
                </div>

                {/* Video */}
                <div className="bg-brutal-black border-y-4 border-brutal-black">
                  <VideoCard 
                    id={entry.id}
                    cid={entry.cid}
                    creator={entry.creator}
                    aiScore={entry.aiScore}
                    aiJudges={entry.aiJudges}
                    audienceScore={entry.audienceScore}
                    status={entry.status}
                    thumbnailUrl={entry.thumbnailUrl}
                    predictionResult={entry.predictionResult}
                    createdAt={entry.createdAt}
                  />
                </div>

                {/* Post Actions & Scores */}
                <div className="p-3 sm:p-4 space-y-3 sm:space-y-4 bg-brutal-white">
                  {/* Scores Row - Chunky Cards */}
                  <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    <div className="brutal-card-blue p-2 sm:p-3 text-center transform hover:rotate-1 transition-transform">
                      <div className="text-[9px] sm:text-xs font-black mb-0.5 sm:mb-1 text-brutal-black">AI</div>
                      <div className="text-xl sm:text-3xl font-black text-brutal-black">
                        {entry.aiScore !== undefined ? entry.aiScore.toFixed(1) : '—'}
                      </div>
                    </div>
                    <div className="brutal-card-yellow p-2 sm:p-3 text-center transform hover:-rotate-1 transition-transform">
                      <div className="text-[9px] sm:text-xs font-black mb-0.5 sm:mb-1 text-brutal-black">PRED</div>
                      {entry.predictionResult ? (
                        entry.predictionResult.settledAt || entry.predictionResult.revealedAt ? (
                          <div className="text-xl sm:text-3xl font-black text-brutal-black">
                            {entry.predictionResult.predictedScore.toFixed(1)}
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-1 text-brutal-black font-black">
                            <span className="text-base sm:text-lg flex items-center gap-1">
                              <span role="img" aria-label="lock">🔒</span> Committed
                            </span>
                            <span className="text-[9px] sm:text-[10px] font-bold text-brutal-black/70 uppercase">
                              Unlocks at #{entry.predictionResult.unlockBlock}
                            </span>
                          </div>
                        )
                      ) : (
                        <div className="text-xl sm:text-3xl font-black text-brutal-black">—</div>
                      )}
                    </div>
                    <div className="brutal-card p-2 sm:p-3 text-center transform hover:rotate-1 transition-transform">
                      <div className="text-[9px] sm:text-xs font-black mb-0.5 sm:mb-1 text-brutal-black">AUD</div>
                      <div className="text-xl sm:text-3xl font-black text-brutal-black">
                        {entry.audienceScore !== undefined ? entry.audienceScore.toFixed(1) : '—'}
                      </div>
                    </div>
                  </div>


                  {/* AI Score Display */}
                  {entry.aiScore !== undefined && entry.id === filteredEntries[0]?.id && (
                    <div className="brutal-card-blue p-3 sm:p-4">
                      <div className="text-center mb-3 sm:mb-4">
                        <div className="text-4xl sm:text-6xl font-black text-brutal-black mb-2 transform -rotate-2">
                          {entry.aiScore}
                          <span className="text-2xl sm:text-3xl text-brutal-black/60">/10</span>
                        </div>
                      </div>

                      {/* Judges */}
                      {entry.aiJudges && entry.aiJudges.length > 0 && (
                        <div className="space-y-2 sm:space-y-3 border-t-4 border-brutal-black pt-3 sm:pt-4 mt-3 sm:mt-4">
                          <p className="text-xs sm:text-sm font-black text-brutal-black mb-2 sm:mb-3 uppercase">🎭 Judge Panel</p>
                          {entry.aiJudges.map((judge, idx) => (
                            <div key={judge.name} className={`brutal-card p-2 sm:p-3 transform ${idx % 2 === 0 ? 'rotate-1' : '-rotate-1'}`}>
                              <div className="flex items-center justify-between mb-1 sm:mb-2">
                                <div className="flex-1 min-w-0">
                                  <p className="font-black text-brutal-black text-xs sm:text-sm truncate">{judge.name}</p>
                                  <p className="text-[10px] sm:text-xs font-bold text-brutal-black/70 truncate">{judge.persona}</p>
                                </div>
                                <span className="text-xl sm:text-2xl font-black text-brutal-black ml-2">{judge.score.toFixed(1)}</span>
                              </div>
                              <p className="text-[10px] sm:text-xs font-medium text-brutal-black/80 line-clamp-2">{judge.comment}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Prediction Result */}
                    {entry.predictionResult && (
                    <div className="brutal-card-yellow p-3 sm:p-4">
                      <div className="flex items-center gap-2 mb-2 sm:mb-3">
                        <span className="text-xl sm:text-2xl">🔐</span>
                        <p className="font-black text-brutal-black uppercase text-xs sm:text-sm">Prediction</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:gap-3 text-sm">
                        <div className="brutal-card p-2">
                          <p className="text-[10px] sm:text-xs font-bold text-brutal-black/70 mb-1">Predicted:</p>
                          {entry.predictionResult.settledAt || entry.predictionResult.revealedAt ? (
                            <p className="font-black text-brutal-black text-base sm:text-lg">
                              {entry.predictionResult.predictedScore}/10
                            </p>
                          ) : (
                            <div className="flex flex-col items-start gap-1 text-brutal-black font-black">
                              <span className="flex items-center gap-1">
                                <span role="img" aria-label="lock">🔒</span> Committed
                              </span>
                              <span className="text-[9px] sm:text-[10px] font-bold text-brutal-black/70 uppercase">
                                Unlocks at #{entry.predictionResult.unlockBlock}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="brutal-card p-2">
                          <p className="text-[10px] sm:text-xs font-bold text-brutal-black/70 mb-1">Block:</p>
                          <p className="font-black text-brutal-black text-base sm:text-lg truncate">{entry.predictionResult.unlockBlock}</p>
                        </div>
                        <div className="col-span-2 brutal-card p-2">
                          <p className="text-[10px] sm:text-xs font-bold text-brutal-black/70 mb-1">Transaction:</p>
                          <a
                            href={`${process.env.NEXT_PUBLIC_STAKING_EXPLORER_URL || 'https://sepolia.scrollscan.com'}/tx/${entry.predictionResult.transactionHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brutal-black font-mono text-[10px] sm:text-xs break-all hover:underline font-bold"
                          >
                            {entry.predictionResult.transactionHash.slice(0, 10)}...{entry.predictionResult.transactionHash.slice(-8)}
                          </a>
                        </div>
                        {!entry.predictionResult.settledAt && !entry.predictionResult.revealedAt && (
                          <div className="col-span-2 space-y-2">
                            <div className="brutal-card p-2 bg-brutal-white/60 text-center">
                              <p className="text-[10px] sm:text-xs font-bold text-brutal-black/70 uppercase">
                                Result locked until Block #{entry.predictionResult.unlockBlock}
                              </p>
                            </div>
                            {(() => {
                              const unlockBlock = BigInt(entry.predictionResult.unlockBlock)
                              const isUnlocked = currentBlock && BigInt(currentBlock) >= unlockBlock
                              
                              // Debug logging
                              if (entry.predictionResult && !entry.predictionResult.settledAt && !entry.predictionResult.revealedAt) {
                                console.log('[Home] Block check:', {
                                  entryId: entry.id,
                                  currentBlock: currentBlock?.toString(),
                                  unlockBlock: unlockBlock.toString(),
                                  isUnlocked,
                                  unlockBlockValue: entry.predictionResult.unlockBlock
                                })
                              }
                              
                              return isUnlocked ? (
                                <button
                                  onClick={() => handleReveal(entry)}
                                  disabled={revealing === entry.id}
                                  className="w-full brutal-btn-blue px-4 py-2 text-xs sm:text-sm font-black uppercase disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {revealing === entry.id ? '⏳ Revealing...' : '🔓 Reveal Prediction'}
                                </button>
                              ) : (
                                <div className="brutal-card p-2 bg-brutal-white/60 text-center">
                                  <p className="text-[10px] sm:text-xs font-bold text-brutal-black/70">
                                    Current: {currentBlock?.toString() || 'Loading...'} | Unlock: {unlockBlock.toString()}
                                  </p>
                                </div>
                              )
                            })()}
                          </div>
                        )}
                        {entry.predictionResult.settledAt && (
                          <div className="col-span-2 space-y-2">
                            <div className={`brutal-card p-3 text-center ${
                              entry.predictionResult.result === 'won' 
                                ? 'bg-green-100 border-green-500' 
                                : 'bg-red-100 border-red-500'
                            }`}>
                              <p className="text-xs sm:text-sm font-black uppercase mb-2">
                                {entry.predictionResult.result === 'won' ? '🎉 YOU WON!' : '❌ YOU LOST'}
                              </p>
                              <p className="text-[10px] sm:text-xs font-bold text-brutal-black/70 uppercase">
                                Revealed {new Date(entry.predictionResult.settledAt).toLocaleString()}
                              </p>
                            </div>
                            
                            {entry.predictionResult.payoutWei && entry.predictionResult.diff !== undefined && (
                              <div className="brutal-card p-3 space-y-2">
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                  <div>
                                    <p className="text-[10px] font-bold text-brutal-black/70 mb-1">Stake:</p>
                                    <p className="font-black text-brutal-black">
                                      {entry.predictionResult.stakeWei 
                                        ? `${formatEth(entry.predictionResult.stakeWei)} ETH`
                                        : '—'}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-[10px] font-bold text-brutal-black/70 mb-1">Payout:</p>
                                    <p className={`font-black ${
                                      entry.predictionResult.result === 'won' ? 'text-green-700' : 'text-red-700'
                                    }`}>
                                      {entry.predictionResult.payoutWei 
                                        ? `${formatEth(entry.predictionResult.payoutWei)} ETH`
                                        : `${formatEth('0')} ETH`}
                                    </p>
                                  </div>
                                </div>
                                
                                <div className="border-t-2 border-brutal-black pt-2 space-y-1">
                                  <div className="flex justify-between text-[10px]">
                                    <span className="font-bold text-brutal-black/70">Predicted:</span>
                                    <span className="font-black text-brutal-black">
                                      {entry.predictionResult.predictedScoreScaled !== undefined
                                        ? (entry.predictionResult.predictedScoreScaled / 100).toFixed(2)
                                        : entry.predictionResult.predictedScore.toFixed(2)}/10
                                    </span>
                                  </div>
                                  <div className="flex justify-between text-[10px]">
                                    <span className="font-bold text-brutal-black/70">AI Score:</span>
                                    <span className="font-black text-brutal-black">
                                      {entry.predictionResult.aiScoreScaled !== undefined
                                        ? (entry.predictionResult.aiScoreScaled / 100).toFixed(2)
                                        : entry.aiScore?.toFixed(2) || '—'}/10
                                    </span>
                                  </div>
                                  <div className="flex justify-between text-[10px]">
                                    <span className="font-bold text-brutal-black/70">Difference:</span>
                                    <span className="font-black text-brutal-black">
                                      {entry.predictionResult.diff !== undefined
                                        ? (entry.predictionResult.diff / 100).toFixed(2)
                                        : '—'} points
                                    </span>
                                  </div>
                                  {entry.predictionResult.diff !== undefined && (
                                    <div className="text-[9px] font-bold text-brutal-black/60 mt-1">
                                      {entry.predictionResult.diff === 0 
                                        ? '🎯 Exact Match! Payout = 200% of your stake.'
                                        : entry.predictionResult.diff <= 25
                                          ? '✅ Within ±0.25 points. Payout = 50% of your stake.'
                                          : entry.predictionResult.diff <= 50
                                            ? '👍 Within ±0.5 points. Payout = 25% of your stake.'
                                            : '❌ More than ±0.5 points away. Payout = 0%.'
                                      }
                                    </div>
                                  )}
                                  <div className="text-[9px] font-semibold text-brutal-black/70 mt-2 space-y-1">
                                    <p className="uppercase">Scoring Chart:</p>
                                    <p>• 🎯 Exact match → 200% of stake</p>
                                    <p>• ✅ Within ±0.25 points → 50% of stake</p>
                                    <p>• 👍 Within ±0.5 points → 25% of stake</p>
                                    <p>• ❌ More than ±0.5 points away → 0% payout</p>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* CID */}
                  <div className="pt-2 sm:pt-3 border-t-4 border-brutal-black">
                    <p className="text-[10px] sm:text-xs font-mono font-bold text-brutal-black/60 break-all">CID: {entry.cid}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 sm:py-16 brutal-card p-6 sm:p-12">
            <div className="text-5xl sm:text-7xl mb-4 sm:mb-6 transform rotate-6">🎬</div>
            <h3 className="text-xl sm:text-3xl font-black text-brutal-black mb-2 sm:mb-3 uppercase">No Entries Yet</h3>
            <p className="text-brutal-black/70 mb-6 sm:mb-8 font-bold text-base sm:text-lg">Be the first to upload!</p>
            <Link
              href="/upload"
              className="inline-block brutal-btn-blue px-6 py-3 sm:px-8 sm:py-4 text-base sm:text-lg"
            >
              🎭 UPLOAD ENTRY
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}
