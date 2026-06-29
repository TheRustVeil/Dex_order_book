export type OrderSide = 'buy' | 'sell'
export type OrderType = 'limit' | 'market'
export type OrderStatus = 'open' | 'filled' | 'partial' | 'cancelled'

export interface Order {
  id: string
  side: OrderSide
  type: OrderType
  price: number      // 0 for market orders
  quantity: number
  filled: number
  status: OrderStatus
  timestamp: number
  trader: string
}

export interface PriceLevel {
  price: number
  quantity: number
  orderCount: number
}

export interface OrderBookSnapshot {
  bids: PriceLevel[]   // sorted high→low
  asks: PriceLevel[]   // sorted low→high
  lastPrice: number
  spread: number
  spreadPct: number
  timestamp: number
}

export interface Trade {
  id: string
  price: number
  quantity: number
  side: OrderSide       // aggressor side
  makerOrderId: string
  takerOrderId: string
  timestamp: number
}

export interface AMMPool {
  tokenA: string
  tokenB: string
  reserveA: number
  reserveB: number
  k: number             // constant product
  fee: number           // e.g. 0.003 = 0.3%
  totalLiquidity: number
}

export interface LPPosition {
  // API-returned fields (LPBalance, RemoveLiquidity)
  lpBalance?: number
  totalSupply?: number
  sharePercent?: number
  valueA?: number
  valueB?: number
  entryPrice?: number
  impermanentLoss?: number
  // Simulation-engine fields (ILCalculator, amm.ts)
  shares?: number
  entryReserveA?: number
  entryReserveB?: number
  entryPriceAinB?: number
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
