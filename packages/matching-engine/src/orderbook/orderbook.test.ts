import { describe, it, expect, beforeEach } from 'vitest'
import { OrderBook } from './orderbook'

describe('OrderBook', () => {
  let book: OrderBook

  beforeEach(() => { book = new OrderBook() })

  // ── placeOrder ────────────────────────────────────────────────────────────

  describe('placeOrder', () => {
    it('places a limit buy order', () => {
      const { order } = book.placeOrder('buy', 'limit', 100, 10, 'alice')
      expect(order.status).toBe('open')
      expect(order.filled).toBe(0)
    })

    it('places a limit sell order', () => {
      const { order } = book.placeOrder('sell', 'limit', 100, 10, 'alice')
      expect(order.status).toBe('open')
    })

    it('market buy uses Infinity price', () => {
      const { order } = book.placeOrder('buy', 'market', 0, 5, 'alice')
      expect(order.price).toBe(Infinity)
    })

    it('market sell uses 0 price', () => {
      const { order } = book.placeOrder('sell', 'market', 0, 5, 'alice')
      expect(order.price).toBe(0)
    })
  })

  // ── matching ──────────────────────────────────────────────────────────────

  describe('matching', () => {
    it('matches a crossing bid and ask', () => {
      book.placeOrder('sell', 'limit', 100, 10, 'alice')
      const { trades } = book.placeOrder('buy', 'limit', 100, 10, 'bob')
      expect(trades).toHaveLength(1)
      expect(trades[0].price).toBe(100)
      expect(trades[0].quantity).toBe(10)
    })

    it('uses maker price (ask price)', () => {
      book.placeOrder('sell', 'limit', 99, 10, 'alice')
      const { trades } = book.placeOrder('buy', 'limit', 105, 10, 'bob')
      expect(trades[0].price).toBe(99)
    })

    it('does not match when bid < ask', () => {
      book.placeOrder('sell', 'limit', 105, 10, 'alice')
      const { trades } = book.placeOrder('buy', 'limit', 100, 10, 'bob')
      expect(trades).toHaveLength(0)
    })

    it('partial fill leaves remainder open', () => {
      book.placeOrder('sell', 'limit', 100, 5, 'alice')
      const { order, trades } = book.placeOrder('buy', 'limit', 100, 10, 'bob')
      expect(trades[0].quantity).toBe(5)
      expect(order.status).toBe('partial')
      expect(order.filled).toBe(5)
    })

    it('fully fills both orders', () => {
      const { order: sell } = book.placeOrder('sell', 'limit', 100, 10, 'alice')
      const { order: buy }  = book.placeOrder('buy',  'limit', 100, 10, 'bob')
      expect(sell.status).toBe('filled')
      expect(buy.status).toBe('filled')
    })

    it('market buy matches against best ask', () => {
      book.placeOrder('sell', 'limit', 100, 10, 'alice')
      book.placeOrder('sell', 'limit', 102, 10, 'alice')
      const { trades } = book.placeOrder('buy', 'market', 0, 10, 'bob')
      expect(trades[0].price).toBe(100) // best ask filled first
    })

    it('price-time priority: earlier order fills first at same price', () => {
      const { order: first }  = book.placeOrder('sell', 'limit', 100, 5, 'alice')
      const { order: second } = book.placeOrder('sell', 'limit', 100, 5, 'carol')
      const { trades } = book.placeOrder('buy', 'limit', 100, 5, 'bob')
      expect(trades[0].makerOrderId).toBe(first.id)
      expect(second.status).toBe('open')
    })
  })

  // ── cancelOrder ───────────────────────────────────────────────────────────

  describe('cancelOrder', () => {
    it('cancels an open order', () => {
      const { order } = book.placeOrder('buy', 'limit', 100, 10, 'alice')
      const ok = book.cancelOrder(order.id)
      expect(ok).toBe(true)
      expect(order.status).toBe('cancelled')
    })

    it('cancelled order is not matched', () => {
      const { order } = book.placeOrder('buy', 'limit', 100, 10, 'alice')
      book.cancelOrder(order.id)
      const { trades } = book.placeOrder('sell', 'limit', 100, 10, 'bob')
      expect(trades).toHaveLength(0)
    })

    it('returns false for unknown order id', () => {
      expect(book.cancelOrder('NONEXISTENT')).toBe(false)
    })
  })

  // ── self-trade prevention ─────────────────────────────────────────────────

  describe('self-trade prevention', () => {
    it('same trader cannot match against own orders', () => {
      book.placeOrder('sell', 'limit', 100, 10, 'alice')
      const { trades } = book.placeOrder('buy', 'limit', 100, 10, 'alice')
      expect(trades).toHaveLength(0)
    })

    it('different traders can match', () => {
      book.placeOrder('sell', 'limit', 100, 10, 'alice')
      const { trades } = book.placeOrder('buy', 'limit', 100, 10, 'bob')
      expect(trades).toHaveLength(1)
    })
  })

  // ── stop-limit orders ────────────────────────────────────────────────────

  describe('stop-limit orders', () => {
    it('stop-limit is parked until trigger price is hit', () => {
      const { order } = book.placeOrder('buy', 'stop-limit', 105, 10, 'alice', 100)
      expect(order.status).toBe('open')
      // No match yet — not in book
      const { trades } = book.placeOrder('sell', 'limit', 104, 10, 'bob')
      expect(trades).toHaveLength(0)
    })

    it('stop-limit activates when price crosses stopPrice', () => {
      // Place a stop-limit buy: triggers at 100, limit price 105
      book.placeOrder('buy', 'stop-limit', 105, 10, 'alice', 100)

      // Push price above 100 via a trade
      book.placeOrder('buy',  'limit', 101, 10, 'charlie')
      book.placeOrder('sell', 'limit', 101, 10, 'dave')    // trade at 101 → triggers stop

      // Now the stop-limit should be in the book as a limit order
      // Place a matching sell — it should fill
      const { trades } = book.placeOrder('sell', 'limit', 104, 10, 'bob')
      expect(trades.length).toBeGreaterThan(0)
    })

    it('throws if stop-limit has no stopPrice', () => {
      expect(() => book.placeOrder('buy', 'stop-limit', 105, 10, 'alice'))
        .toThrow('stop-limit requires stopPrice')
    })
  })

  // ── views ────────────────────────────────────────────────────────────────

  describe('views', () => {
    it('getBestBid returns highest bid', () => {
      book.placeOrder('buy', 'limit', 99,  10, 'alice')
      book.placeOrder('buy', 'limit', 100, 10, 'alice')
      expect(book.getBestBid()).toBe(100)
    })

    it('getBestAsk returns lowest ask', () => {
      book.placeOrder('sell', 'limit', 101, 10, 'alice')
      book.placeOrder('sell', 'limit', 102, 10, 'alice')
      expect(book.getBestAsk()).toBe(101)
    })

    it('getMidPrice returns average of best bid and ask', () => {
      book.placeOrder('buy',  'limit', 100, 10, 'alice')
      book.placeOrder('sell', 'limit', 102, 10, 'alice')
      expect(book.getMidPrice()).toBe(101)
    })

    it('getSnapshot returns correct depth', () => {
      book.placeOrder('buy',  'limit', 99, 5, 'alice')
      book.placeOrder('sell', 'limit', 101, 5, 'alice')
      const snap = book.getSnapshot()
      expect(snap.bids).toHaveLength(1)
      expect(snap.asks).toHaveLength(1)
      expect(snap.spread).toBe(2)
    })

    it('getRecentTrades returns trades in reverse order', () => {
      book.placeOrder('sell', 'limit', 100, 5, 'alice')
      book.placeOrder('buy',  'limit', 100, 5, 'bob')
      book.placeOrder('sell', 'limit', 100, 5, 'alice')
      book.placeOrder('buy',  'limit', 100, 5, 'bob')
      const trades = book.getRecentTrades(10)
      expect(trades.length).toBe(2)
      expect(trades[0].timestamp).toBeGreaterThanOrEqual(trades[1].timestamp)
    })
  })

  // ── benchmark ────────────────────────────────────────────────────────────

  describe('benchmark', () => {
    it('processes 10,000 orders in under 500ms', () => {
      book.seed(1000, 20, 1, 100)
      const start = Date.now()
      for (let i = 0; i < 10_000; i++) {
        const side  = i % 2 === 0 ? 'buy' : 'sell' as const
        const price = 990 + Math.floor(Math.random() * 20)
        book.placeOrder(side, 'limit', price, 1 + Math.random() * 10, `trader-${i % 50}`)
      }
      const elapsed = Date.now() - start
      expect(elapsed).toBeLessThan(500)
    })
  })
})
