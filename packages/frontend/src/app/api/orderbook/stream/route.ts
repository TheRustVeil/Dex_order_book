import { sim } from '@/lib/engine/simulation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      // Send initial state immediately
      const snap = sim.ob.getSnapshot(15)
      const send = (type: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, data })}\n\n`))
        } catch {}
      }

      send('snapshot', snap)
      send('trades', sim.ob.getRecentTrades(20))
      send('amm', sim.amm.getPool())
      send('spread', sim.getSpreadHistory())
      send('candles', sim.getCandles())

      const unsub = sim.subscribe((type, data) => {
        send(type, data)
        if (type === 'snapshot') send('candles', sim.getCandles())
      })

      // Clean up when client disconnects
      return () => { unsub() }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
