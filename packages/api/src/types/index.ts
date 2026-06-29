export type Side      = 'buy' | 'sell'
export type OrderType = 'limit' | 'market'
export type OrderStatus = 'open' | 'filled' | 'partial' | 'cancelled'

export interface Order {
  id: string
  trader: string       // wallet address
  pairId: string
  side: Side
  type: OrderType
  price: number
  quantity: number
  filled: number
  status: OrderStatus
  nonce?: number
  expiry?: number
  signature?: string
  createdAt: number
  updatedAt: number
}

export interface Trade {
  id: string
  pairId: string
  makerOrderId: string
  takerOrderId: string
  price: number
  quantity: number
  side: Side           // taker side
  fee: number
  txHash?: string
  timestamp: number
}

export interface PriceLevel {
  price: number
  quantity: number
  orderCount: number
}

export interface OrderBookSnapshot {
  bids: PriceLevel[]
  asks: PriceLevel[]
  lastPrice: number
  spread: number
  spreadPct: number
  timestamp: number
}

export interface PlaceOrderRequest {
  trader: string
  pairId?: string      // defaults to 'ETH-USDC' when omitted
  side: Side
  type: OrderType
  price?: number       // required for limit
  quantity: number
  nonce?: number
  expiry?: number
  signature?: string
  id?: string          // preserve original ID for P2P-relayed orders
  p2pOrigin?: boolean  // true when order arrived via P2P — skip persist + re-broadcast
}

export interface CancelOrderRequest {
  trader: string
  signature?: string
  deadline?: number
}

export interface Stats24h {
  pairId: string
  volume: number
  high: number
  low: number
  open: number
  close: number
  tradeCount: number
}

// ─── AMM + Chart types ────────────────────────────────────────────────────────

export interface AMMPool {
  tokenA: string
  tokenB: string
  reserveA: number
  reserveB: number
  k: number
  fee: number
  totalLiquidity: number
}

export interface LPPosition {
  shares: number
  entryReserveA: number
  entryReserveB: number
  entryPriceAinB: number
}

export interface ILResult {
  currentValueHold: number
  currentValueLP: number
  impermanentLoss: number
  impermanentLossPct: number
  priceRatio: number
}

export interface SpreadDataPoint {
  time: number
  spread: number
  spreadPct: number
  midPrice: number
}

export interface CandleData {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type SSEPriceLevel = PriceLevel
export type SSESnapshot   = OrderBookSnapshot
