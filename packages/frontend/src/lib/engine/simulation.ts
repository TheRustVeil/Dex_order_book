/**
 * Simulation engine: generates random market activity to keep the order book live.
 * Runs server-side as a singleton.
 */
import { OrderBook } from './orderbook'
import { AMMEngine } from './amm'
import { Trade, SpreadDataPoint, CandleData } from '@/types'

const INITIAL_PRICE = 2000   // ETH/USDC

class SimulationEngine {
  public ob = new OrderBook()
  public amm = new AMMEngine('ETH', 'USDC', 100, 100 * INITIAL_PRICE)

  private spreadHistory: SpreadDataPoint[] = []
  private candles: CandleData[] = []
  private currentCandle: CandleData | null = null
  private listeners = new Set<(type: string, data: unknown) => void>()
  private intervalId: ReturnType<typeof setInterval> | null = null

  constructor() {
    this.ob.seed(INITIAL_PRICE, 20, 1, 50)
    this.initCandle()
  }

  subscribe(cb: (type: string, data: unknown) => void) {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private emit(type: string, data: unknown) {
    this.listeners.forEach(l => l(type, data))
  }

  private initCandle() {
    const t = Math.floor(Date.now() / 60000) * 60000
    const p = this.ob.getLastPrice() || INITIAL_PRICE
    this.currentCandle = { time: t, open: p, high: p, low: p, close: p, volume: 0 }
  }

  private updateCandle(price: number, qty: number) {
    if (!this.currentCandle) this.initCandle()
    const candle = this.currentCandle!
    const t = Math.floor(Date.now() / 60000) * 60000

    if (t > candle.time) {
      this.candles.push(candle)
      if (this.candles.length > 200) this.candles.shift()
      this.currentCandle = { time: t, open: price, high: price, low: price, close: price, volume: qty }
    } else {
      candle.high = Math.max(candle.high, price)
      candle.low = Math.min(candle.low, price)
      candle.close = price
      candle.volume += qty
    }
    this.emit('candle', this.currentCandle)
  }

  private tick() {
    const mid = this.ob.getMidPrice() || INITIAL_PRICE
    const rand = Math.random()

    if (rand < 0.35) {
      // Random market order
      const side = Math.random() > 0.5 ? 'buy' : 'sell' as const
      const qty = +(1 + Math.random() * 10).toFixed(4)
      const { trades } = this.ob.placeOrder(side, 'market', 0, qty, 'bot')
      trades.forEach(t => this.updateCandle(t.price, t.quantity))

    } else if (rand < 0.75) {
      // New limit order near mid
      const side = Math.random() > 0.5 ? 'buy' : 'sell' as const
      const offset = +(Math.random() * 5).toFixed(2)
      const price = side === 'buy' ? +(mid - offset).toFixed(2) : +(mid + offset).toFixed(2)
      const qty = +(2 + Math.random() * 20).toFixed(4)
      this.ob.placeOrder(side, 'limit', price, qty, 'bot')

    } else if (rand < 0.85) {
      // AMM swap (small)
      const side = Math.random() > 0.5 ? 'A' : 'B' as const
      const amountIn = side === 'A' ? 0.1 + Math.random() * 2 : 200 + Math.random() * 4000
      try { this.amm.executeSwap(amountIn, side) } catch {}
    }
    // else: do nothing (thin tick)

    // Record spread
    const snap = this.ob.getSnapshot(1)
    if (snap.bids.length && snap.asks.length) {
      const pt: SpreadDataPoint = {
        time: Date.now(),
        spread: snap.spread,
        spreadPct: snap.spreadPct,
        midPrice: snap.lastPrice || mid,
      }
      this.spreadHistory.push(pt)
      if (this.spreadHistory.length > 300) this.spreadHistory.shift()
    }

    this.emit('snapshot', this.ob.getSnapshot(15))
    this.emit('trades', this.ob.getRecentTrades(20))
    this.emit('amm', this.amm.getPool())
    this.emit('spread', this.getSpreadHistory())
  }

  start(intervalMs = 800) {
    if (this.intervalId) return
    this.intervalId = setInterval(() => this.tick(), intervalMs)
  }

  stop() {
    if (this.intervalId) { clearInterval(this.intervalId); this.intervalId = null }
  }

  getSpreadHistory() { return [...this.spreadHistory] }
  getCandles() { return [...this.candles, ...(this.currentCandle ? [this.currentCandle] : [])] }
}

// Singleton on the Node.js process
const globalKey = '__dex_sim__'
// @ts-expect-error global singleton
if (!global[globalKey]) {
  // @ts-expect-error global singleton
  global[globalKey] = new SimulationEngine()
  // @ts-expect-error global singleton
  global[globalKey].start()
}
// @ts-expect-error global singleton
export const sim: SimulationEngine = global[globalKey]
