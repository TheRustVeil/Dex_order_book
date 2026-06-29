import type { FastifyInstance } from 'fastify'
import { orderBookService } from '../services/orderbook.service.js'

export async function tradesRoutes(app: FastifyInstance): Promise<void> {
  // GET /trades — recent trades
  app.get<{ Querystring: { limit?: string; pairId?: string } }>('/trades', async (req, reply) => {
    const limit  = parseInt(req.query.limit ?? '50', 10)
    const trades = orderBookService.getRecentTrades(limit)
    const filtered = req.query.pairId
      ? trades.filter(t => t.pairId === req.query.pairId)
      : trades
    return reply.send(filtered)
  })

  // GET /trades/stats — 24h stats
  app.get<{ Querystring: { pairId: string } }>('/trades/stats', async (req, reply) => {
    if (!req.query.pairId) return reply.status(400).send({ error: 'pairId required' })
    const stats = orderBookService.get24hStats(req.query.pairId)
    return reply.send(stats)
  })
}
