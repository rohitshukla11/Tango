import { NextRequest, NextResponse } from 'next/server'
import { publishWindowEvent } from '../../../../../lib/arkiv'

// Vercel serverless function configuration
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { entryId, videoCid, creator, windowSeconds, kind, metadata } = body ?? {}

    if (!entryId || !videoCid || !creator) {
      return NextResponse.json(
        { error: 'entryId, videoCid, and creator are required' },
        { status: 400 },
      )
    }

    const seconds = Math.max(Number(windowSeconds) || 0, 0)

    const result = await publishWindowEvent({
      entryId: String(entryId),
      videoCid: String(videoCid),
      creator: String(creator),
      windowSeconds: seconds > 0 ? seconds : undefined,
      kind,
      metadata,
    })

    if (!result) {
      return NextResponse.json({ error: 'Arkiv window publish failed' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      entityKey: result.entityKey,
      expiresAt: result.expiresAt,
    })
  } catch (error: any) {
    console.error('[Arkiv Window] Error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to publish TTL window' },
      { status: 500 },
    )
  }
}

