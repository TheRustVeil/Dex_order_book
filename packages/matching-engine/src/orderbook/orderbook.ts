import { Order, OrderSide, OrderType, PriceLevel, OrderBookSnapshot, Trade } from '../types/index'

let orderIdCounter = 1
let tradeIdCounter = 1

function genOrderId() { return `ORD-${(orderIdCounter++).toString().padStart(6, '0')}` }
function genTradeId() { return `TRD-${(tradeIdCounter++).toString().padStart(6, '0')}` }

export class OrderBook {
  // bids: Map<price, Order[]> — sorted descending
  private bids: Map<number, Order[]> = new Map()
  // asks: Map<price, Order[]> — sorted ascending
  private asks: Map<number, Order[]> = new Map()
  // stop-limit orders waiting for their trigger price
  private stopOrders: Order[] = []
  private orders: Map<string, Order> = new Map()
  private trades: Trade[] = []
  private lastPrice = 0
  private onTrade?: (t: Trade) => void

  setOnTrade(cb: (t: Trade) => void) { this.onTrade = cb }

  placeOrder(
    side: OrderSide,
    type: OrderType,
    price: number,
    quantity: number,
    trader = 'anon',
    stopPrice?: number
  ): { order: Order; trades: Trade[] } {
    const order: Order = {
      id: genOrderId(),
      side,
      type,
      price: type === 'market' ? (side === 'buy' ? Infinity : 0) : price,
      stopPrice,
      quantity,
      filled: 0,
      status: 'open',
      timestamp: Date.now(),
      trader,
    }

    this.orders.set(order.id, order)

    // Stop-limit: park until trigger price is hit
    if (type === 'stop-limit') {
      if (!stopPrice) throw new Error('stop-limit requires stopPrice')
      this.stopOrders.push(order)
      return { order, trades: [] }
    }

    const newTrades = this.match(order)
    newTrades.forEach(t => { this.trades.unshift(t); this.onTrade?.(t) })

    if (order.status === 'open' || order.status === 'partial') {
      if (type !== 'market') this.addToBook(order)
      else order.status = order.filled > 0 ? 'filled' : 'cancelled'
    }

    return { order, trades: newTrades }
  }

  cancelOrder(id: string): boolean {
    const order = this.orders.get(id)
    if (!order || order.status === 'filled' || order.status === 'cancelled') return false
    order.status = 'cancelled'
    this.removeFromBook(order)
    return true
  }

  private match(taker: Order): Trade[] {
    const trades: Trade[] = []
    const oppositeBook = taker.side === 'buy' ? this.asks : this.bids
    const prices = this.getSortedPrices(taker.side === 'buy' ? 'ask' : 'bid')

    for (const price of prices) {
      if (taker.filled >= taker.quantity) break

      const canMatch = taker.side === 'buy'
        ? price <= taker.price
        : price >= taker.price

      if (!canMatch) break

      const makers = oppositeBook.get(price) ?? []
      for (let i = 0; i < makers.length; i++) {
        const maker = makers[i]
        if (taker.filled >= taker.quantity) break
        if (maker.status === 'cancelled' || maker.status === 'filled') continue

        // Self-trade prevention: skip orders from the same trader
        if (maker.trader === taker.trader) continue

        const available = maker.quantity - maker.filled
        const fillQty = Math.min(available, taker.quantity - taker.filled)

        maker.filled += fillQty
        taker.filled += fillQty
        maker.status = maker.filled >= maker.quantity ? 'filled' : 'partial'
        taker.status = taker.filled >= taker.quantity ? 'filled' : 'partial'

        const prevLastPrice = this.lastPrice
        this.lastPrice = price

        const trade: Trade = {
          id: genTradeId(),
          price,
          quantity: fillQty,
          side: taker.side,
          makerOrderId: maker.id,
          takerOrderId: taker.id,
          timestamp: Date.now(),
        }
        trades.push(trade)

        // After every fill, check if any stop-limit orders are triggered
        this.checkStopOrders(prevLastPrice, price)
      }

      // Remove fully-filled makers from book
      oppositeBook.set(price, makers.filter(m => m.status !== 'filled' && m.status !== 'cancelled'))
      if ((oppositeBook.get(price)?.length ?? 0) === 0) oppositeBook.delete(price)
    }

    return trades
  }

  // Activate stop-limit orders whose trigger price has been crossed
  private checkStopOrders(prevPrice: number, newPrice: number) {
    const triggered = this.stopOrders.filter(o => {
      if (!o.stopPrice) return false
      if (o.side === 'buy')  return prevPrice < o.stopPrice && newPrice >= o.stopPrice
      if (o.side === 'sell') return prevPrice > o.stopPrice && newPrice <= o.stopPrice
      return false
    })
    this.stopOrders = this.stopOrders.filter(o => !triggered.includes(o))
    triggered.forEach(o => {
      o.type = 'limit' // convert to limit order at its limit price
      this.addToBook(o)
    })
  }

  private addToBook(order: Order) {
    const book = order.side === 'buy' ? this.bids : this.asks
    const level = book.get(order.price) ?? []
    level.push(order)
    book.set(order.price, level)
  }

  private removeFromBook(order: Order) {
    const book = order.side === 'buy' ? this.bids : this.asks
    const level = book.get(order.price) ?? []
    book.set(order.price, level.filter(o => o.id !== order.id))
  }

  private getSortedPrices(side: 'bid' | 'ask'): number[] {
    const book = side === 'bid' ? this.bids : this.asks
    const prices = Array.from(book.keys())
    return side === 'bid'
      ? prices.sort((a, b) => b - a)   // highest first for bids
      : prices.sort((a, b) => a - b)   // lowest first for asks
  }

  getSnapshot(depth = 20): OrderBookSnapshot {
    const bids: PriceLevel[] = this.getSortedPrices('bid').slice(0, depth).map(p => {
      const orders = this.bids.get(p) ?? []
      return {
        price: p,
        quantity: orders.reduce((s, o) => s + (o.quantity - o.filled), 0),
        orderCount: orders.length,
      }
    }).filter(l => l.quantity > 0)

    const asks: PriceLevel[] = this.getSortedPrices('ask').slice(0, depth).map(p => {
      const orders = this.asks.get(p) ?? []
      return {
        price: p,
        quantity: orders.reduce((s, o) => s + (o.quantity - o.filled), 0),
        orderCount: orders.length,
      }
    }).filter(l => l.quantity > 0)

    const bestBid = bids[0]?.price ?? 0
    const bestAsk = asks[0]?.price ?? 0
    const spread = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 0
    const mid = (bestBid + bestAsk) / 2
    const spreadPct = mid > 0 ? (spread / mid) * 100 : 0

    return { bids, asks, lastPrice: this.lastPrice, spread, spreadPct, timestamp: Date.now() }
  }

  getRecentTrades(n = 50): Trade[] { return this.trades.slice(0, n) }
  getLastPrice() { return this.lastPrice }
  getBestBid() { return this.getSortedPrices('bid')[0] ?? 0 }
  getBestAsk() { return this.getSortedPrices('ask')[0] ?? 0 }
  getMidPrice() {
    const b = this.getBestBid(); const a = this.getBestAsk()
    return b && a ? (b + a) / 2 : b || a || 0
  }

  /** Seed the order book with realistic resting orders around a mid price */
  seed(midPrice: number, levels = 15, stepSize = 1, baseQty = 100) {
    for (let i = 1; i <= levels; i++) {
      const bidPrice = +(midPrice - i * stepSize).toFixed(2)
      const askPrice = +(midPrice + i * stepSize).toFixed(2)
      const qty = baseQty * (1 + Math.random() * 4)
      this.placeOrder('buy', 'limit', bidPrice, +qty.toFixed(4), 'market-maker')
      this.placeOrder('sell', 'limit', askPrice, +qty.toFixed(4), 'market-maker')
    }
    this.lastPrice = midPrice
  }
}
