'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useBlockNumber } from 'wagmi'
import { saveUploadedEntry, type AIJudgeResult, type PredictionResult, type Entry } from '@/hooks/useEntries'
import { useScrollPrediction } from '@/hooks/useScrollPrediction'

interface VideoCardProps {
  id: string
  cid: string
  creator: string
  aiScore?: number
  aiJudges?: AIJudgeResult[]
  audienceScore?: number
  status: 'pending' | 'judged' | 'finalized'
  thumbnailUrl?: string
  predictionResult?: PredictionResult
  createdAt?: number
}

export default function VideoCard({
  id,
  cid,
  creator,
  aiScore,
  aiJudges,
  audienceScore,
  status,
  thumbnailUrl,
  predictionResult,
  createdAt,
}: VideoCardProps) {
  const [loading, setLoading] = useState(true)
  const [videoError, setVideoError] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [revealing, setRevealing] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const { data: currentBlock } = useBlockNumber({ watch: true })
  const { revealPrediction } = useScrollPrediction()

  const unlockBlock = useMemo(() => {
    if (!predictionResult?.unlockBlock) return undefined
    try {
      return BigInt(predictionResult.unlockBlock)
    } catch {
      return undefined
    }
  }, [predictionResult?.unlockBlock])

  const isUnlockBlockReached = useMemo(() => {
    if (!unlockBlock) return false
    if (typeof currentBlock === 'undefined') return false
    return currentBlock >= unlockBlock
  }, [currentBlock, unlockBlock])

  const hasRevealed = Boolean(predictionResult?.settledAt || predictionResult?.revealedAt)

  // Debug: Log predictionResult and reveal state
  useEffect(() => {
    if (predictionResult) {
      console.log('[VideoCard] Prediction result received for entry', id, ':', predictionResult)
    } else {
      console.log('[VideoCard] No prediction result for entry', id)
    }
  }, [predictionResult, id])

  const handleReveal = async () => {
    if (!predictionResult || !isUnlockBlockReached || hasRevealed || revealing) {
      return
    }

    const numericId = Number(id)
    if (!Number.isFinite(numericId)) {
      console.error('[VideoCard] Invalid entry id for reveal:', id)
      return
    }

    if (!predictionResult.salt) {
      console.error('[VideoCard] Missing salt for reveal:', id)
      return
    }

    try {
      setRevealing(true)
      console.log('[VideoCard] Revealing prediction for entry', id)
      await revealPrediction(numericId, predictionResult.predictedScore, predictionResult.salt)

      const updatedPrediction: PredictionResult = {
        ...predictionResult,
        revealedAt: Date.now(),
        settledAt: Date.now(),
      }

      const updatedEntry: Entry = {
        id,
        cid,
        creator,
        aiScore,
        aiJudges,
        audienceScore,
        status: 'finalized',
        thumbnailUrl,
        createdAt,
        predictionResult: updatedPrediction,
      }

      saveUploadedEntry(updatedEntry)
    } catch (error) {
      console.error('[VideoCard] Reveal failed:', error)
    } finally {
      setRevealing(false)
    }
  }

  // Use Synapse API route for video streaming
  const videoUrl = `/api/video/${cid}`

  // Handle video load errors
  const handleVideoError = () => {
    console.error('[VideoCard] Video playback error for CID:', cid)
    setVideoError(true)
    setLoading(false)
  }

  // Auto-play when video comes into view
  useEffect(() => {
    const videoElement = videoRef.current
    if (!videoElement || !videoUrl) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // Only play if video is paused and ready
            if (videoElement.paused && videoElement.readyState >= 2) {
              videoElement.play().catch((e) => {
                // Silently handle autoplay prevention (browser policy)
                if (e.name !== 'AbortError') {
                  console.log('[VideoCard] Autoplay prevented:', e)
                }
              })
            }
          } else {
            // Only pause if video is playing
            if (!videoElement.paused) {
              videoElement.pause()
            }
          }
        })
      },
      {
        threshold: 0.5,
      }
    )

    observer.observe(videoElement)

    return () => {
      observer.disconnect()
    }
  }, [videoUrl])

  return (
    <div className="relative w-full bg-brutal-black aspect-[9/16] sm:aspect-[4/5] max-h-[60vh] sm:max-h-[70vh]">
      {loading && !videoError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-brutal-black z-10">
          <div className="w-12 h-12 sm:w-16 sm:h-16 border-4 sm:border-8 border-argentina-blue border-t-argentina-yellow animate-spin mb-2 sm:mb-3" />
          <div className="text-xs sm:text-sm font-black text-brutal-white uppercase tracking-wider">Loading...</div>
        </div>
      )}
      
      {cid && !videoError ? (
        <video
          ref={videoRef}
          key={videoUrl}
          src={videoUrl}
          className="w-full h-full object-cover cursor-pointer"
          preload="auto"
          autoPlay
          muted
          playsInline
          loop
          onLoadedMetadata={() => {
            setLoading(false)
            // Try to start playing if video is in view
            if (videoRef.current && !videoRef.current.paused) {
              videoRef.current.play().catch(() => {
                // Autoplay may be prevented by browser policy
              })
            }
          }}
          onCanPlay={() => {
            // Video has enough data to start playing
            setLoading(false)
          }}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onError={handleVideoError}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (videoRef.current) {
              if (videoRef.current.paused) {
                videoRef.current.play()
              } else {
                videoRef.current.pause()
              }
            }
          }}
        >
          Your browser does not support the video tag.
        </video>
      ) : null}
      
      {/* Play/Pause Indicator - Neo-Brutalism Style */}
      {!loading && cid && !videoError && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {!isPlaying && (
            <div className="w-16 h-16 sm:w-24 sm:h-24 bg-argentina-yellow border-4 border-brutal-black shadow-brutal-lg flex items-center justify-center transform rotate-3">
              <svg
                className="w-8 h-8 sm:w-12 sm:h-12 text-brutal-black ml-1"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
              </svg>
            </div>
          )}
        </div>
      )}
      
      {(videoError || !cid) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-brutal-black">
          <div className="w-16 h-16 sm:w-24 sm:h-24 bg-brutal-white border-4 border-brutal-black shadow-brutal-lg flex items-center justify-center mb-3 sm:mb-4 transform -rotate-3">
            <svg
              className="w-10 h-10 sm:w-16 sm:h-16 text-brutal-black"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" />
            </svg>
          </div>
          {videoError && (
            <div className="px-3 py-1.5 sm:px-4 sm:py-2 bg-red-500 border-4 border-brutal-black shadow-brutal font-black text-brutal-white text-[10px] sm:text-xs uppercase">
              Video Unavailable
            </div>
          )}
        </div>
      )}

    </div>
  )
}
