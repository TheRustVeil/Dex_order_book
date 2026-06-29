import { randomUUID } from 'crypto'
import { OrderBook } from '@zetheta/matching-engine'
import type { Trade as METrade } from '@zetheta/matching-engine'
import { saveOrder, updateOrderInDb, saveTrade, loadAllOrders } from '../db/sqlite.js'
import type {
  Order, Trade, OrderBookSnapshot, PlaceOrderRequest, Stats24h,
} from '../types/index.js'

// Real CLOB from packages/matching-engine
const ob = new OrderBook()

// API-format orders indexed by UUID (for trader lookups and external API)
const apiOrders = new Map<string, Order>()
// Bidirectional ME-order-ID ↔ UUID mapping
const meIdToUuid = new Map<string, string>()
const uuidToMeId = new Map<string, string>()
// API-format trades (accumulated in memory; full history is in SQLite)
const apiTrades: Trade[] = []

// Set before ob.placeOrder() so the synchronous setOnTrade callback can use them
let pendingTakerUuid:   string | null = null
let pendingTakerTrader: string | null = null
let pendingPairId = 'ETH-USDC'

export type TradeCallback        = (trade: Trade) => void
export type SnapshotCallback     = (snap: OrderBookSnapshot) => void
export type OrderUpdateCallback  = (wallet: string, order: Order) => void
export type OrderPlacedCallback  = (order: Order) => void

const tradeCallbacks:        TradeCallback[]        = []
const snapshotCallbacks:     SnapshotCallback[]     = []
const orderUpdateCallbacks:  OrderUpdateCallback[]  = []
const orderPlacedCallbacks:  OrderPlacedCallback[]  = []

// ── Startup: reload open orders from SQLite ───────────────────────────────────

function _reloadFromDb(): void {
  const { all, open } = loadAllOrders()

  // Restore all orders to memory (for GET /orders/:id, order history, etc.)
  for (const order of all) apiOrders.set(order.id, order)

  // Re-place only open/partial orders back into the matching engine
  let reloaded = 0
  for (const order of open) {
    const remaining = order.quantity - order.filled
    if (remaining <= 0) continue

    const { order: meOrder } = ob.placeOrder(
      order.side,
      order.type,
      order.price,
      remaining,
      order.trader,
    )

    meIdToUuid.set(meOrder.id, order.id)
    uuidToMeId.set(order.id, meOrder.id)
    reloaded++
  }

  if (all.length) console.log(`[DB] Loaded ${all.length} orders from disk, re-placed ${reloaded} into matching engine`)
}

_reloadFromDb()

// ── Matching engine trade callback ────────────────────────────────────────────

// Fires synchronously inside ob.placeOrder() for every fill
ob.setOnTrade((meTrade: METrade) => {
  // Update maker order status in memory and DB
  const makerUuid = meIdToUuid.get(meTrade.makerOrderId)
  if (makerUuid) {
    const maker = apiOrders.get(makerUuid)
    if (maker) {
      maker.filled  += meTrade.quantity
      maker.status   = maker.filled >= maker.quantity ? 'filled' : 'partial'
      maker.updatedAt = meTrade.timestamp
      if (maker.trader !== 'bot' && maker.trader !== 'seed') updateOrderInDb(maker)
      orderUpdateCallbacks.forEach(cb => cb(maker.trader, maker))
    }
  }

  const trade: Trade = {
    id:           randomUUID(),
    pairId:       pendingPairId,
    makerOrderId: makerUuid                ?? meTrade.makerOrderId,
    takerOrderId: pendingTakerUuid         ?? meTrade.takerOrderId,
    price:        meTrade.price,
    quantity:     meTrade.quantity,
    side:         meTrade.side,
    fee:          meTrade.price * meTrade.quantity * 0.003,
    timestamp:    meTrade.timestamp,
  }

  apiTrades.push(trade)
  // Only persist trades that involve at least one real user (not bots or seed)
  const isBot = (t: string | null | undefined) =>
    !t || t === 'bot' || t === 'seed' || t === 'market-maker'
  const makerOrder = makerUuid ? apiOrders.get(makerUuid) : undefined
  const takerIsUser = !isBot(pendingTakerTrader)
  const makerIsUser = makerUuid !== undefined && !isBot(makerOrder?.trader)
  if (takerIsUser || makerIsUser) saveTrade(trade)
  tradeCallbacks.forEach(cb => cb(trade))
})

// ── Service ───────────────────────────────────────────────────────────────────

export const orderBookService = {

  // Seed the book with resting market-maker orders (not persisted — transient)
  seed(midPrice: number): void {
    ob.seed(midPrice, 20, 1, 50)
  },

  // ─── Order lifecycle ───────────────────────────────────────────────────────

  placeOrder(req: PlaceOrderRequest): { order: Order; trades: Trade[] } {
    if (!req.trader)   throw new Error('trader required')
    if (!req.pairId)   req.pairId = 'ETH-USDC'
    if (!req.quantity || req.quantity <= 0) throw new Error('quantity must be positive')
    if (req.type === 'limit' && (!req.price || req.price <= 0)) throw new Error('price required for limit order')

    const uuid = req.id ?? randomUUID()
    const now  = Date.now()

    // Set context for the trade callback before entering the matching engine
    pendingTakerUuid   = uuid
    pendingTakerTrader = req.trader.toLowerCase()
    pendingPairId      = req.pairId

    const tradesBefore = apiTrades.length
    const { order: meOrder } = ob.placeOrder(
      req.side,
      req.type,
      req.price ?? 0,
      req.quantity,
      req.trader.toLowerCase(),
    )

    pendingTakerUuid   = null
    pendingTakerTrader = null

    // Register UUID ↔ ME-ID for future maker callbacks
    meIdToUuid.set(meOrder.id, uuid)
    uuidToMeId.set(uuid, meOrder.id)

    const order: Order = {
      id:        uuid,
      trader:    req.trader.toLowerCase(),
      pairId:    req.pairId,
      side:      req.side,
      type:      req.type,
      price:     req.price ?? 0,
      quantity:  meOrder.quantity,
      filled:    meOrder.filled,
      status:    meOrder.status as Order['status'],
      nonce:     req.nonce,
      expiry:    req.expiry,
      signature: req.signature,
      createdAt: now,
      updatedAt: meOrder.filled > 0 ? Date.now() : now,
    }

    apiOrders.set(uuid, order)

    // Only persist user orders placed locally — bot/seed and P2P-relayed orders are transient
    const isUserOrder = req.trader !== 'bot' && req.trader !== 'seed' && !req.p2pOrigin
    if (isUserOrder) saveOrder(order)

    // Notify P2P broadcast hook (only for local user orders — not bots or P2P relays)
    const isBotOrder = req.trader === 'bot' || req.trader === 'seed' || req.trader === 'market-maker'
    if (!req.p2pOrigin && !isBotOrder) orderPlacedCallbacks.forEach(cb => cb(order))

    const executedTrades = apiTrades.slice(tradesBefore)
    this._emitSnapshot()
    return { order, trades: executedTrades }
  },

  cancelOrder(orderId: string, trader: string): boolean {
    const order = apiOrders.get(orderId)
    if (!order) return false
    if (order.trader !== trader.toLowerCase()) throw new Error('not your order')
    if (order.status === 'filled' || order.status === 'cancelled') return false

    const meId = uuidToMeId.get(orderId)
    if (!meId) return false

    const ok = ob.cancelOrder(meId)
    if (ok) {
      order.status    = 'cancelled'
      order.updatedAt = Date.now()
      if (order.trader !== 'bot' && order.trader !== 'seed') updateOrderInDb(order)
      this._emitOrderUpdate(order)
      this._emitSnapshot()
    }
    return ok
  },

  getOrder(orderId: string): Order | undefined {
    return apiOrders.get(orderId)
  },

  getTraderOrders(trader: string, status?: string): Order[] {
    return [...apiOrders.values()].filter(o =>
      o.trader === trader.toLowerCase() &&
      (status == null || o.status === status)
    ).sort((a, b) => b.createdAt - a.createdAt)
  },

  getSnapshot(depth = 15): OrderBookSnapshot {
    return ob.getSnapshot(depth)
  },

  getSSESnapshot(depth = 15): OrderBookSnapshot {
    return ob.getSnapshot(depth)
  },

  getRecentTrades(limit = 50): Trade[] {
    return apiTrades.slice(-limit).reverse()
  },

  get24hStats(pairId: string): Stats24h {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000
    const recent = apiTrades.filter(t => t.pairId === pairId && t.timestamp >= cutoff)

    if (recent.length === 0) {
      const last  = apiTrades.filter(t => t.pairId === pairId).at(-1)
      const price = last?.price ?? 0
      return { pairId, volume: 0, high: price, low: price, open: price, close: price, tradeCount: 0 }
    }

    const prices = recent.map(t => t.price)
    const volume = recent.reduce((s, t) => s + t.quantity * t.price, 0)
    return {
      pairId,
      volume,
      high:       Math.max(...prices),
      low:        Math.min(...prices),
      open:       recent[0].price,
      close:      recent.at(-1)!.price,
      tradeCount: recent.length,
    }
  },

  getLastPrice(): number | null {
    const p = ob.getLastPrice()
    return p > 0 ? p : null
  },

  getMidPrice(): number | null {
    const m = ob.getMidPrice()
    return m > 0 ? m : null
  },

  // ─── Subscriptions ─────────────────────────────────────────────────────────

  onTrade(cb: TradeCallback): () => void {
    tradeCallbacks.push(cb)
    return () => { const i = tradeCallbacks.indexOf(cb); if (i >= 0) tradeCallbacks.splice(i, 1) }
  },

  onSnapshot(cb: SnapshotCallback): () => void {
    snapshotCallbacks.push(cb)
    return () => { const i = snapshotCallbacks.indexOf(cb); if (i >= 0) snapshotCallbacks.splice(i, 1) }
  },

  onOrderUpdate(cb: OrderUpdateCallback): () => void {
    orderUpdateCallbacks.push(cb)
    return () => { const i = orderUpdateCallbacks.indexOf(cb); if (i >= 0) orderUpdateCallbacks.splice(i, 1) }
  },

  onOrderPlaced(cb: OrderPlacedCallback): () => void {
    orderPlacedCallbacks.push(cb)
    return () => { const i = orderPlacedCallbacks.indexOf(cb); if (i >= 0) orderPlacedCallbacks.splice(i, 1) }
  },

  _emitSnapshot(): void {
    const snap = ob.getSnapshot(15)
    snapshotCallbacks.forEach(cb => cb(snap))
  },

  _emitOrderUpdate(order: Order): void {
    orderUpdateCallbacks.forEach(cb => cb(order.trader, order))
  },
}
