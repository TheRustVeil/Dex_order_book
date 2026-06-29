import type { FastifyInstance } from 'fastify'
import { simulationService } from '../services/simulation.service.js'
import { orderBookService } from '../services/orderbook.service.js'
import { ammService } from '../services/amm.service.js'

export async function streamRoutes(app: FastifyInstance): Promise<void> {
  app.get('/stream', async (req, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type':                'text/event-stream',
      'Cache-Control':               'no-cache',
      'Connection':                  'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering':           'no',
    })
    reply.raw.flushHeaders()

    const send = (type: string, data: unknown) => {
      try {
        reply.raw.write(`data: ${JSON.stringify({ type, data })}\n\n`)
      } catch {
        // client already disconnected
      }
    }

    // Send current state immediately on connect
    send('snapshot', orderBookService.getSSESnapshot(15))
    send('trades',   orderBookService.getRecentTrades(20))
    send('amm',      ammService.getPool())
    send('spread',   simulationService.getSpreadHistory())
    send('candles',  simulationService.getCandles())

    // Subscribe to simulation ticks
    const unsub = simulationService.subscribe(send)

    // Keep the handler alive until client disconnects
    await new Promise<void>(resolve => {
      req.raw.on('close', () => {
        unsub()
        resolve()
      })
    })
  })
}
