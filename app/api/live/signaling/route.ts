import { NextResponse } from 'next/server'

// Server-side ephemeral signaling cache
const roomSignalingQueue = new Map<string, Array<Record<string, unknown>>>()

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { sessionId, type } = body

    if (!sessionId || !type) {
      return NextResponse.json({ error: 'Missing sessionId or signal type' }, { status: 400 })
    }

    let queue = roomSignalingQueue.get(sessionId)
    if (!queue) {
      queue = []
      roomSignalingQueue.set(sessionId, queue)
    }

    // Keep last 100 signaling events per room
    queue.push({ ...body, receivedAt: Date.now() })
    if (queue.length > 100) {
      queue.shift()
    }

    return NextResponse.json({ success: true, timestamp: Date.now() })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Signaling error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get('sessionId')
  const since = Number(searchParams.get('since') || 0)

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })
  }

  const queue = roomSignalingQueue.get(sessionId) || []
  const freshSignals = queue.filter(s => (s.receivedAt as number) > since)

  return NextResponse.json({
    signals: freshSignals,
    timestamp: Date.now()
  })
}
