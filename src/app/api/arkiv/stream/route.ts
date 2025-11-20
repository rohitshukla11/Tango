import { NextRequest, NextResponse } from 'next/server'
import { getArkivPublicClient, toArkivSummary } from '../../../../../lib/arkiv'

// Vercel serverless function configuration
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60 // SSE stream timeout

export async function GET(req: NextRequest) {
  const publicClient = await getArkivPublicClient()
  if (!publicClient) {
    return NextResponse.json({ error: 'Arkiv public client unavailable' }, { status: 500 })
  }

  const url = new URL(req.url)
  const typeParam =
    url.searchParams.get('types') || process.env.NEXT_PUBLIC_ARKIV_REALTIME_TYPES || 'score,bet,window'
  const allowedTypes = typeParam
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  const heartbeatInterval = Math.max(Number(url.searchParams.get('heartbeat')) || 15000, 1000)

  let stopSubscription: (() => void | Promise<void>) | null = null
  let heartbeatTimer: NodeJS.Timeout | null = null
  let closed = false
  let cleanup: (() => void) | null = null

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(`event: status\ndata: ${JSON.stringify({ status: 'connected' })}\n\n`)

      heartbeatTimer = setInterval(() => {
        controller.enqueue(`event: ping\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`)
      }, heartbeatInterval)

      try {
        const stop = await publicClient.subscribeEntityEvents({
          onEntityCreated: async (event) => {
            try {
              const entity = await publicClient.getEntity(event.entityKey)
              const summary = toArkivSummary(entity)
              const entityType = summary.attributes?.type
              if (allowedTypes.length && entityType && !allowedTypes.includes(entityType)) {
                return
              }

              controller.enqueue(
                `event: ${entityType || 'arkiv'}\ndata: ${JSON.stringify({
                  type: entityType,
                  entityKey: summary.entityKey,
                  attributes: summary.attributes,
                  payload: summary.payload,
                  createdAt: summary.createdAt,
                  expiresAt: summary.expirationTimestamp,
                })}\n\n`,
              )
            } catch (error) {
              controller.enqueue(
                `event: error\ndata: ${JSON.stringify({
                  message: 'failed to fetch Arkiv entity',
                  error: String(error),
                })}\n\n`,
              )
            }
          },
          onEntityExpiresInExtended: (event) => {
            controller.enqueue(
              `event: ttl\ndata: ${JSON.stringify({
                entityKey: event.entityKey,
                newExpirationBlock: event.newExpirationBlock,
              })}\n\n`,
            )
          },
          onError: (err) => {
            controller.enqueue(
              `event: error\ndata: ${JSON.stringify({
                message: err?.message ?? 'Arkiv subscription error',
              })}\n\n`,
            )
          },
        })

        stopSubscription = stop
      } catch (error) {
        controller.enqueue(
          `event: error\ndata: ${JSON.stringify({
            message: 'Failed to subscribe to Arkiv events',
            error: String(error),
          })}\n\n`,
        )
      }

      cleanup = () => {
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer)
          heartbeatTimer = null
        }
        if (stopSubscription) {
          Promise.resolve(stopSubscription()).catch((err) => {
            console.error('[Arkiv Stream] Failed to stop subscription:', err)
          })
          stopSubscription = null
        }
        req.signal.removeEventListener('abort', abortHandler)
      }

      const abortHandler = () => {
        if (!closed) {
          closed = true
          cleanup?.()
          controller.close()
        }
      }

      req.signal.addEventListener('abort', abortHandler)
    },
    cancel() {
      if (closed) return
      closed = true
      cleanup?.()
    },
  })

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}

