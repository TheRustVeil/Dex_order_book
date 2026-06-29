import { BigDecimal, BigInt, Bytes } from '@graphprotocol/graph-ts'
import {
  OrderPlaced as OrderPlacedEvent,
  OrderCancelled as OrderCancelledEvent,
  TradeExecuted as TradeExecutedEvent,
} from '../generated/OrderBook/OrderBook'
import { Order, Trade, DailyVolume } from '../generated/schema'

// ── Helpers ──────────────────────────────────────────────────────────────────

function toDecimal(raw: BigInt, decimals: i32 = 18): BigDecimal {
  const scale = BigInt.fromI32(10).pow(u8(decimals))
  return raw.toBigDecimal().div(scale.toBigDecimal())
}

function dayKey(pairId: string, timestamp: BigInt): string {
  const day = timestamp.toI32() / 86400
  return pairId + '-' + day.toString()
}

// ── Handlers ─────────────────────────────────────────────────────────────────

export function handleOrderPlaced(event: OrderPlacedEvent): void {
  const order = new Order(event.params.orderId.toHexString())
  order.trader          = event.params.trader
  order.pairId          = event.params.pairId
  order.side            = event.params.side == 0 ? 'buy' : 'sell'
  order.orderType       = 'limit'          // not emitted in event; limit is default
  order.price           = toDecimal(event.params.price)
  order.quantity        = toDecimal(event.params.quantity)
  order.filled          = BigDecimal.zero()
  order.status          = 'open'
  order.nonce           = BigInt.zero()    // not emitted in event
  order.expiry          = BigInt.zero()    // not emitted in event
  order.blockNumber     = event.block.number
  order.blockTimestamp  = event.block.timestamp
  order.transactionHash = event.transaction.hash
  order.save()
}

export function handleOrderCancelled(event: OrderCancelledEvent): void {
  const order = Order.load(event.params.orderId.toHexString())
  if (!order) return
  order.status = 'cancelled'
  order.save()
}

export function handleTradeExecuted(event: TradeExecutedEvent): void {
  const tradeId = event.transaction.hash.toHexString() + '-' + event.logIndex.toString()
  const trade   = new Trade(tradeId)
  trade.buyOrderId      = event.params.buyOrderId
  trade.sellOrderId     = event.params.sellOrderId
  trade.price           = toDecimal(event.params.price)
  trade.quantity        = toDecimal(event.params.quantity)
  trade.fee             = trade.price.times(trade.quantity).times(BigDecimal.fromString('0.003'))
  trade.blockNumber     = event.block.number
  trade.blockTimestamp  = event.block.timestamp
  trade.transactionHash = event.transaction.hash
  trade.save()

  // Update filled amounts on matched orders
  const buyOrder = Order.load(event.params.buyOrderId.toHexString())
  if (buyOrder) {
    buyOrder.filled = buyOrder.filled.plus(trade.quantity)
    buyOrder.status = buyOrder.filled >= buyOrder.quantity ? 'filled' : 'partial'
    buyOrder.save()
  }
  const sellOrder = Order.load(event.params.sellOrderId.toHexString())
  if (sellOrder) {
    sellOrder.filled = sellOrder.filled.plus(trade.quantity)
    sellOrder.status = sellOrder.filled >= sellOrder.quantity ? 'filled' : 'partial'
    sellOrder.save()
  }

  // Update daily OHLCV — derive pairId from the buy order entity
  const pairIdStr = buyOrder
    ? (buyOrder.pairId as Bytes).toHexString()
    : 'unknown'

  const key  = dayKey(pairIdStr, event.block.timestamp)
  let daily  = DailyVolume.load(key)
  if (!daily) {
    daily            = new DailyVolume(key)
    daily.pairId     = pairIdStr
    daily.date       = key
    daily.volume     = BigDecimal.zero()
    daily.tradeCount = BigInt.zero()
    daily.high       = trade.price
    daily.low        = trade.price
    daily.open       = trade.price
    daily.close      = trade.price
  }
  daily.volume     = daily.volume.plus(trade.price.times(trade.quantity))
  daily.tradeCount = daily.tradeCount.plus(BigInt.fromI32(1))
  if (trade.price > daily.high) daily.high = trade.price
  if (trade.price < daily.low)  daily.low  = trade.price
  daily.close = trade.price
  daily.save()
}
