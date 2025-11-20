import { NextRequest, NextResponse } from 'next/server'
import { publishBetEvent } from '../../../../../lib/arkiv'

// Vercel serverless function configuration
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      entryId,
      videoCid,
      predictor,
      predictedScore,
      stakeWei,
      transactionHash,
      unlockBlock,
      expiresInSeconds,
      metadata,
    } = body ?? {}

    if (!entryId || !videoCid || !predictor || !stakeWei) {
      return NextResponse.json(
        { error: 'entryId, videoCid, predictor, and stakeWei are required' },
        { status: 400 },
      )
    }

    const numericScore = Number(predictedScore)
    if (!Number.isFinite(numericScore)) {
      return NextResponse.json({ error: 'predictedScore must be numeric' }, { status: 400 })
    }

    const expiresIn = Math.max(Number(expiresInSeconds) || 0, 0)

    const result = await publishBetEvent({
      entryId: String(entryId),
      videoCid: String(videoCid),
      predictor: String(predictor),
      predictedScore: numericScore,
      stakeWei: String(stakeWei),
      transactionHash: transactionHash ? String(transactionHash) : undefined,
      unlockBlock: unlockBlock ? String(unlockBlock) : undefined,
      expiresInSeconds: expiresIn > 0 ? expiresIn : undefined,
      metadata,
    })

    if (!result) {
      return NextResponse.json({ error: 'Arkiv bet publish failed' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      entityKey: result.entityKey,
      expiresAt: result.expiresAt,
    })
  } catch (error: any) {
    console.error('[Arkiv Bets] Error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to publish bet' }, { status: 500 })
  }
}

