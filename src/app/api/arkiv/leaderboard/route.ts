import { NextResponse } from 'next/server'
import { queryEntitiesByType } from '../../../../../lib/arkiv'

type ScorePayload = {
  aiScore?: number
  aiScoreScaled?: number
  judges?: Array<{ score: number }>
  createdAt?: number
  expiresAt?: number
}

type BetPayload = {
  predictedScore?: number
  stakeWei?: string
  expiresAt?: number
  createdAt?: number
}

type WindowPayload = {
  kind?: string
  windowSeconds?: number
  expiresAt?: number
  createdAt?: number
}

export async function GET() {
  try {
    const [scores, bets, windows] = await Promise.all([
      queryEntitiesByType<ScorePayload>('score', 500),
      queryEntitiesByType<BetPayload>('bet', 500),
      queryEntitiesByType<WindowPayload>('window', 200),
    ])

    const leaderboard = scores
      .map((entity) => {
        const score =
          Number(entity.attributes?.score ?? entity.payload?.aiScore ?? entity.payload?.aiScoreScaled ?? 0)
        return {
          entryId: entity.attributes?.entryId ?? 'unknown',
          score: Number.isFinite(score) ? score : 0,
          creator: entity.attributes?.creator ?? 'unknown',
          judges: Number(entity.payload?.judges?.length ?? 0),
          createdAt: entity.createdAt ?? entity.payload?.createdAt ?? Date.now(),
          expiresAt: entity.expirationTimestamp ?? entity.payload?.expiresAt,
        }
      })
      .filter((row) => row.entryId !== 'unknown')
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)

    const creatorMap = new Map<
      string,
      { creator: string; entries: number; totalScore: number; bestScore: number; lastScoreAt: number }
    >()

    leaderboard.forEach((row) => {
      const creator = row.creator ?? 'unknown'
      if (!creatorMap.has(creator)) {
        creatorMap.set(creator, { creator, entries: 0, totalScore: 0, bestScore: 0, lastScoreAt: 0 })
      }
      const record = creatorMap.get(creator)!
      record.entries += 1
      record.totalScore += row.score
      record.bestScore = Math.max(record.bestScore, row.score)
      record.lastScoreAt = Math.max(record.lastScoreAt, row.createdAt ?? 0)
    })

    const creatorAnalytics = Array.from(creatorMap.values())
      .map((record) => ({
        ...record,
        avgScore: record.entries > 0 ? Number((record.totalScore / record.entries).toFixed(2)) : 0,
      }))
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, 10)

    let totalStake = 0n
    let totalPrediction = 0
    let predictors = new Set<string>()
    const now = Date.now()
    let activeBets = 0
    let expiredBets = 0
    let soonExpiring = 0

    const betSummaries = bets.map((entity) => {
      const expiresAt = entity.expirationTimestamp ?? entity.payload?.expiresAt ?? 0
      const predictedScore = Number(entity.payload?.predictedScore ?? entity.attributes?.predictedScore ?? 0)
      const stake = BigInt(entity.attributes?.stakeWei ?? entity.payload?.stakeWei ?? '0')
      const status = expiresAt && expiresAt < now ? 'expired' : 'active'

      totalStake += stake
      totalPrediction += Number.isFinite(predictedScore) ? predictedScore : 0
      predictors.add(entity.attributes?.predictor ?? 'unknown')
      if (status === 'active') {
        activeBets += 1
        if (expiresAt && expiresAt - now < 10 * 60 * 1000) {
          soonExpiring += 1
        }
      } else {
        expiredBets += 1
      }

      return {
        entityKey: entity.entityKey,
        entryId: entity.attributes?.entryId,
        predictor: entity.attributes?.predictor,
        predictedScore,
        stakeWei: entity.attributes?.stakeWei,
        expiresAt,
        status,
      }
    })

    const windowsSummary = windows.map((entity) => ({
      entityKey: entity.entityKey,
      entryId: entity.attributes?.entryId,
      kind: entity.attributes?.kind ?? entity.payload?.kind ?? 'prediction',
      windowSeconds: Number(entity.payload?.windowSeconds ?? entity.attributes?.windowSeconds ?? 0),
      expiresAt: entity.expirationTimestamp ?? entity.payload?.expiresAt,
      createdAt: entity.createdAt ?? entity.payload?.createdAt,
    }))

    const response = {
      updatedAt: now,
      leaderboard,
      creatorAnalytics,
      bets: {
        total: betSummaries.length,
        active: activeBets,
        expired: expiredBets,
        expiringSoon: soonExpiring,
        uniquePredictors: predictors.size,
        totalStakeWei: totalStake.toString(),
        avgPrediction: betSummaries.length
          ? Number((totalPrediction / betSummaries.length).toFixed(2))
          : 0,
        records: betSummaries.slice(0, 25),
      },
      windows: {
        total: windowsSummary.length,
        active: windowsSummary.filter((w) => (w.expiresAt ?? 0) > now).length,
        expired: windowsSummary.filter((w) => (w.expiresAt ?? 0) <= now).length,
        items: windowsSummary.slice(0, 25),
      },
    }

    return NextResponse.json(response)
  } catch (error: any) {
    console.error('[Arkiv Leaderboard] Error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to build analytics' }, { status: 500 })
  }
}

