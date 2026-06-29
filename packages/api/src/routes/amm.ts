import type { FastifyInstance } from 'fastify'
import { ammService, recordLPPosition, removeLPPosition, getLPPosition } from '../services/amm.service.js'
import type { LPPosition } from '../types/index.js'

export async function ammRoutes(app: FastifyInstance): Promise<void> {

  // POST /amm/swap  — quote or execute a swap
  app.post<{
    Body: { amountIn: number; tokenIn: 'A' | 'B'; dryRun?: boolean }
  }>('/amm/swap', async (req, reply) => {
    const { amountIn, tokenIn, dryRun } = req.body
    if (!amountIn || amountIn <= 0) return reply.status(400).send({ error: 'Invalid amount' })

    try {
      if (dryRun) {
        const quote = ammService.quoteSwap(amountIn, tokenIn)
        return reply.send({ success: true, quote })
      }
      const result = ammService.executeSwap(amountIn, tokenIn)
      const pool   = ammService.getPool()
      return reply.send({ success: true, result, pool })
    } catch (e) {
      return reply.status(500).send({ error: String(e) })
    }
  })

  // POST /amm/liquidity  — add liquidity
  app.post<{
    Body: { amountA: number; amountB: number; amountAMin?: number; amountBMin?: number; wallet?: string }
  }>('/amm/liquidity', async (req, reply) => {
    const { amountA, amountB, wallet = 'anon' } = req.body
    if (!amountA || !amountB || amountA <= 0 || amountB <= 0) {
      return reply.status(400).send({ error: 'Invalid amounts' })
    }

    try {
      const result = ammService.addLiquidity(amountA, amountB)
      const pool   = ammService.getPool()

      recordLPPosition(wallet, result.sharesIssued, result.actualAmountA, result.actualAmountB)
      const pos = getLPPosition(wallet)!

      const position = {
        ...pos,
        lpBalance:   pos.shares,
        totalSupply: pool.totalLiquidity,
      }

      return reply.send({
        success:       true,
        lpMinted:      result.sharesIssued,   // AddLiquidity.tsx
        sharesIssued:  result.sharesIssued,   // ILCalculator.tsx
        amountA:       result.actualAmountA,  // AddLiquidity.tsx
        amountB:       result.actualAmountB,  // AddLiquidity.tsx
        actualAmountA: result.actualAmountA,  // ILCalculator.tsx
        actualAmountB: result.actualAmountB,  // ILCalculator.tsx
        position,
        ilCurve:  ammService.getILCurve(),
        pool,
      })
    } catch (e) {
      return reply.status(500).send({ error: String(e) })
    }
  })

  // Alias: POST /amm/liquidity/add
  app.post<{
    Body: { amountA: number; amountB: number; amountAMin?: number; amountBMin?: number; wallet?: string }
  }>('/amm/liquidity/add', async (req, reply) => {
    const { amountA, amountB, wallet = 'anon' } = req.body
    if (!amountA || !amountB || amountA <= 0 || amountB <= 0) {
      return reply.status(400).send({ error: 'Invalid amounts' })
    }

    try {
      const result = ammService.addLiquidity(amountA, amountB)
      const pool   = ammService.getPool()

      recordLPPosition(wallet, result.sharesIssued, result.actualAmountA, result.actualAmountB)
      const pos = getLPPosition(wallet)!

      const position = {
        ...pos,
        lpBalance:   pos.shares,
        totalSupply: pool.totalLiquidity,
      }

      return reply.send({
        success:       true,
        lpMinted:      result.sharesIssued,
        sharesIssued:  result.sharesIssued,
        amountA:       result.actualAmountA,
        amountB:       result.actualAmountB,
        actualAmountA: result.actualAmountA,
        actualAmountB: result.actualAmountB,
        position,
        ilCurve:  ammService.getILCurve(),
        pool,
      })
    } catch (e) {
      return reply.status(500).send({ error: String(e) })
    }
  })

  // POST /amm/liquidity/remove
  app.post<{
    Body: { lpAmount: number; amountAMin?: number; amountBMin?: number; wallet?: string }
  }>('/amm/liquidity/remove', async (req, reply) => {
    const { lpAmount, wallet = 'anon' } = req.body
    if (!lpAmount || lpAmount <= 0) return reply.status(400).send({ error: 'Invalid lpAmount' })

    try {
      const { amountA, amountB } = ammService.removeLiquidity(lpAmount)
      removeLPPosition(wallet, lpAmount)

      const pool = ammService.getPool()
      const pos  = getLPPosition(wallet)
      const position = pos
        ? { ...pos, lpBalance: pos.shares, totalSupply: pool.totalLiquidity }
        : null

      return reply.send({ success: true, amountA, amountB, position, pool })
    } catch (e) {
      return reply.status(500).send({ error: String(e) })
    }
  })

  // POST /amm/il  — calculate IL for a position
  app.post<{
    Body: { position: LPPosition }
  }>('/amm/il', async (req, reply) => {
    const { position } = req.body
    if (!position) return reply.status(400).send({ error: 'Missing position' })

    try {
      const ilResult = ammService.calcImpermanentLoss(position)
      const ilCurve  = ammService.getILCurve()
      return reply.send({ success: true, ilResult, ilCurve })
    } catch (e) {
      return reply.status(500).send({ error: String(e) })
    }
  })

  // GET /amm/il  — IL curve + current pool state (for ILCalculator initial load)
  app.get('/amm/il', async (_req, reply) => {
    const ilCurve = ammService.getILCurve()
    const pool    = ammService.getPool()
    return reply.send({ ilCurve, pool })
  })

  // GET /amm/position  — LP position for a wallet
  app.get<{ Querystring: { wallet: string } }>('/amm/position', async (req, reply) => {
    const { wallet } = req.query
    if (!wallet) return reply.status(400).send({ error: 'wallet required' })

    const pos  = getLPPosition(wallet)
    const pool = ammService.getPool()

    if (!pos) return reply.send({ success: true, position: null })

    return reply.send({
      success:  true,
      position: { ...pos, lpBalance: pos.shares, totalSupply: pool.totalLiquidity },
    })
  })

  // GET /amm/pool  — current AMM pool state
  app.get('/amm/pool', async (_req, reply) => {
    return reply.send({ success: true, pool: ammService.getPool() })
  })
}
