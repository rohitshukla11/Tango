import { NextRequest, NextResponse } from 'next/server'
// Use dynamic import for Synapse SDK to avoid build-time SSR issues

// Disable Next.js caching for this route (videos are too large)
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store' // Prevent Next.js from caching fetch requests

export async function GET(
  req: NextRequest,
  { params }: { params: { cid: string } }
) {
  try {
    const { cid } = params
    
    if (!cid) {
      return NextResponse.json({ error: 'CID is required' }, { status: 400 })
    }

    // Get range header for partial content requests
    const range = req.headers.get('range')
    
    // Initialize Synapse SDK via dynamic import
    const { createSynapseFromEnv } = await import('../../../../../lib/synapse')
    const synapse = await createSynapseFromEnv()
    
    // Download video from Synapse
    // Note: Synapse SDK download() returns ArrayBuffer, so we need to handle it
    const videoData = await synapse.storage.download(cid)
    const videoBuffer = Buffer.from(videoData)
    const fileSize = videoBuffer.length
    
    // Support HTTP Range requests for video streaming
    if (range) {
      // Parse range header (e.g., "bytes=0-1023")
      const parts = range.replace(/bytes=/, '').split('-')
      const start = parseInt(parts[0], 10)
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
      const chunkSize = end - start + 1
      const chunk = videoBuffer.slice(start, end + 1)
      
      return new NextResponse(chunk, {
        status: 206, // Partial Content
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize.toString(),
          'Content-Type': 'video/mp4',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      })
    }
    
    // Return full video if no range requested
    // Use streaming response to avoid loading entire file into memory at once
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(videoBuffer)
        controller.close()
      },
    })
    
    return new NextResponse(stream, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': fileSize.toString(),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    })
  } catch (error: any) {
    console.error('[Video API] Error fetching video:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch video' },
      { status: 500 }
    )
  }
}

