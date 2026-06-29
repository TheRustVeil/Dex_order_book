import type { FastifyInstance } from 'fastify'
import { orderBookService } from '../services/orderbook.service.js'

export async function orderbookRoutes(app: FastifyInstance): Promise<void> {
  // GET /orderbook/:pair — order book snapshot
  app.get<{ Params: { pair: string }; Querystring: { depth?: string } }>(
    '/orderbook/:pair',
    async (req, reply) => {
      const depth = parseInt(req.query.depth ?? '15', 10)
      const snap  = orderBookService.getSnapshot(depth)
      return reply.send({ pairId: req.params.pair, ...snap })
    }
  )
}
