import type { SpreadDataPoint, CandleData } from '../types/index.js'
import { orderBookService } from './orderbook.service.js'
import { ammService } from './amm.service.js'

const INITIAL_PRICE = 2000
const PAIR_ID = 'ETH-USDC'

class SimulationService {
  private spreadHistory: SpreadDataPoint[] = []
  private candles: CandleData[] = []
  private currentCandle: CandleData | null = null
  private listeners = new Set<(type: string, data: unknown) => void>()
  private intervalId: ReturnType<typeof setInterval> | null = null

  constructor() {
    this._seed()
    this._initCandle()
  }

  subscribe(cb: (type: string, data: unknown) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private emit(type: string, data: unknown): void {
    this.listeners.forEach(l => l(type, data))
  }

  private _seed(): void {
    orderBookService.seed(INITIAL_PRICE)
  }

  private _initCandle(): void {
    const t = Math.floor(Date.now() / 60000) * 60000
    this.currentCandle = { time: t, open: INITIAL_PRICE, high: INITIAL_PRICE, low: INITIAL_PRICE, close: INITIAL_PRICE, volume: 0 }
  }

  private _updateCandle(price: number, qty: number): void {
    if (!this.currentCandle) this._initCandle()
    const c = this.currentCandle!
    const t = Math.floor(Date.now() / 60000) * 60000

    if (t > c.time) {
      this.candles.push(c)
      if (this.candles.length > 200) this.candles.shift()
      this.currentCandle = { time: t, open: price, high: price, low: price, close: price, volume: qty }
    } else {
      c.high = Math.max(c.high, price)
      c.low  = Math.min(c.low, price)
      c.close = price
      c.volume += qty
    }
  }

  private _tick(): void {
    const mid = orderBookService.getMidPrice() ?? INITIAL_PRICE
    const rand = Math.random()

    if (rand < 0.35) {
      // Random market order from bot
      const side = Math.random() > 0.5 ? 'buy' : 'sell' as const
      const qty = +(1 + Math.random() * 10).toFixed(4)
      const { trades } = orderBookService.placeOrder({ trader: 'bot', pairId: PAIR_ID, side, type: 'market', quantity: qty })
      trades.forEach(t => this._updateCandle(t.price, t.quantity))

    } else if (rand < 0.75) {
      // New limit order near mid
      const side = Math.random() > 0.5 ? 'buy' : 'sell' as const
      const offset = +(Math.random() * 5).toFixed(2)
      const price  = side === 'buy' ? +(mid - offset).toFixed(2) : +(mid + offset).toFixed(2)
      const qty    = +(2 + Math.random() * 20).toFixed(4)
      orderBookService.placeOrder({ trader: 'bot', pairId: PAIR_ID, side, type: 'limit', price, quantity: qty })

    } else if (rand < 0.85) {
      // Small AMM swap
      const tokenIn  = Math.random() > 0.5 ? 'A' : 'B' as const
      const amountIn = tokenIn === 'A' ? 0.1 + Math.random() * 2 : 200 + Math.random() * 4000
      try { ammService.executeSwap(amountIn, tokenIn) } catch {}
    }

    // Record spread
    const sseSnap = orderBookService.getSSESnapshot(1)
    if (sseSnap.bids.length && sseSnap.asks.length) {
      const pt: SpreadDataPoint = {
        time: Date.now(),
        spread: sseSnap.spread,
        spreadPct: sseSnap.spreadPct,
        midPrice: sseSnap.lastPrice || mid,
      }
      this.spreadHistory.push(pt)
      if (this.spreadHistory.length > 300) this.spreadHistory.shift()
    }

    this.emit('snapshot', orderBookService.getSSESnapshot(15))
    this.emit('trades',   orderBookService.getRecentTrades(20))
    this.emit('amm',      ammService.getPool())
    this.emit('spread',   this.getSpreadHistory())
    this.emit('candles',  this.getCandles())
  }

  start(intervalMs = 800): void {
    if (this.intervalId) return
    this.intervalId = setInterval(() => this._tick(), intervalMs)
  }

  stop(): void {
    if (this.intervalId) { clearInterval(this.intervalId); this.intervalId = null }
  }

  getSpreadHistory(): SpreadDataPoint[] { return [...this.spreadHistory] }
  getCandles(): CandleData[] { return [...this.candles, ...(this.currentCandle ? [this.currentCandle] : [])] }

  // Push current state immediately to all SSE subscribers (called after user places order)
  broadcastNow(): void {
    this.emit('snapshot', orderBookService.getSSESnapshot(15))
    this.emit('trades',   orderBookService.getRecentTrades(20))
    this.emit('amm',      ammService.getPool())
  }
}

// Node.js process singleton
const SIM_KEY = '__dex_api_sim__'
const g = global as unknown as Record<string, unknown>
if (!g[SIM_KEY]) {
  const s = new SimulationService()
  s.start()
  g[SIM_KEY] = s
}
export const simulationService = g[SIM_KEY] as SimulationService
