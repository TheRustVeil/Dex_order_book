import type { FastifyInstance } from 'fastify'
import { orderBookService } from '../services/orderbook.service.js'
import { ammService } from '../services/amm.service.js'
import { simulationService } from '../services/simulation.service.js'
import type { PlaceOrderRequest } from '../types/index.js'

// Rate limit store: wallet → { count, windowStart }
const rateLimits = new Map<string, { count: number; windowStart: number }>()
const RATE_WINDOW = 60_000
const RATE_MAX    = 60

function checkRateLimit(wallet: string): boolean {
  const now = Date.now()
  const rec = rateLimits.get(wallet)
  if (!rec || now - rec.windowStart > RATE_WINDOW) {
    rateLimits.set(wallet, { count: 1, windowStart: now })
    return true
  }
  if (rec.count >= RATE_MAX) return false
  rec.count++
  return true
}

// Add a timestamp alias to each order so the frontend (which uses o.timestamp) works
function addTimestamp<T extends { createdAt: number }>(o: T) {
  return { ...o, timestamp: o.createdAt }
}

export async function ordersRoutes(app: FastifyInstance): Promise<void> {

  // POST /orders — place a limit or market order
  app.post<{ Body: PlaceOrderRequest }>('/orders', async (req, reply) => {
    const body = req.body
    if (!body?.trader) return reply.status(400).send({ error: 'trader required' })
    if (!checkRateLimit(body.trader)) return reply.status(429).send({ error: 'rate limit exceeded' })

    try {
      const result = orderBookService.placeOrder(body)
      const order  = result.order

      // AMM hybrid routing: unfilled portion of market orders goes to the pool
      let ammFill: {
        ethQty: number; amountOut: number; priceImpact: number; newSpotPrice: number; tokenIn: 'A' | 'B'
      } | null = null

      if (body.type === 'market' && order.filled < order.quantity) {
        const unfilled = +(order.quantity - order.filled).toFixed(8)
        try {
          const spotPrice = ammService.getSpotPrice()
          if (body.side === 'buy') {
            const usdcIn = +(unfilled * spotPrice).toFixed(8)
            const swap = ammService.executeSwap(usdcIn, 'B')
            ammFill = { ethQty: swap.amountOut, amountOut: swap.amountOut, priceImpact: swap.priceImpact, newSpotPrice: swap.newSpotPrice, tokenIn: 'B' }
          } else {
            const swap = ammService.executeSwap(unfilled, 'A')
            ammFill = { ethQty: unfilled, amountOut: swap.amountOut, priceImpact: swap.priceImpact, newSpotPrice: swap.newSpotPrice, tokenIn: 'A' }
          }
        } catch {
          // AMM can fail (empty pool, math overflow) — skip fallback
        }
      }

      // Broadcast updated state to SSE clients after user order
      simulationService.broadcastNow()

      return reply.status(201).send({
        success: true,
        order:   addTimestamp(order),
        trades:  result.trades,
        ammFill,
      })
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message })
    }
  })

  // GET /orders — open orders for a wallet
  app.get<{ Querystring: { trader: string; status?: string } }>('/orders', async (req, reply) => {
    const { trader, status } = req.query
    if (!trader) return reply.status(400).send({ error: 'trader query param required' })

    const result = orderBookService.getTraderOrders(trader, status)
    return reply.send({ success: true, orders: result.map(addTimestamp) })
  })

  // GET /orders/history — filled/cancelled orders for a wallet
  app.get<{ Querystring: { trader: string; limit?: string; offset?: string } }>('/orders/history', async (req, reply) => {
    const { trader } = req.query
    const limit  = parseInt(req.query.limit  ?? '20')
    const offset = parseInt(req.query.offset ?? '0')

    if (!trader) return reply.status(400).send({ error: 'trader required' })

    const filled    = orderBookService.getTraderOrders(trader, 'filled')
    const cancelled = orderBookService.getTraderOrders(trader, 'cancelled')
    const sorted    = [...filled, ...cancelled].sort((a, b) => b.updatedAt - a.updatedAt)
    const page      = sorted.slice(offset, offset + limit)

    return reply.send({
      success: true,
      orders:  page.map(addTimestamp),
      total:   sorted.length,
      limit,
      offset,
    })
  })

  // GET /orders/:id — single order
  app.get<{ Params: { id: string } }>('/orders/:id', async (req, reply) => {
    const order = orderBookService.getOrder(req.params.id)
    if (!order) return reply.status(404).send({ error: 'order not found' })
    return reply.send(addTimestamp(order))
  })

  // DELETE /orders/:id — cancel order
  app.delete<{
    Params: { id: string }
    Body: { trader: string }
  }>('/orders/:id', async (req, reply) => {
    const { trader } = req.body ?? {}
    if (!trader) return reply.status(400).send({ error: 'trader required in body' })

    try {
      const ok = orderBookService.cancelOrder(req.params.id, trader)
      if (!ok) return reply.status(404).send({ error: 'order not found or already closed' })
      simulationService.broadcastNow()
      return reply.send({ success: true })
    } catch (err) {
      return reply.status(403).send({ error: (err as Error).message })
    }
  })
}
