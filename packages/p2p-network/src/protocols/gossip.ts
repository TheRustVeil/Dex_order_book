import { createHash } from 'crypto'
import type { P2PMessage, P2POrder, CancelPayload, FillPayload } from '../types/index.js'

export const ORDER_TOPIC  = 'dex/orders/1.0.0'
export const CANCEL_TOPIC = 'dex/cancels/1.0.0'
export const FILL_TOPIC   = 'dex/fills/1.0.0'
export const SYNC_TOPIC   = 'dex/sync/1.0.0'

export function buildMsgId(type: string, payload: unknown): string {
  return createHash('sha256')
    .update(type + JSON.stringify(payload))
    .digest('hex')
    .slice(0, 16)
}

export function encodeMessage(msg: P2PMessage): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(msg))
}

export function decodeMessage(data: Uint8Array): P2PMessage {
  return JSON.parse(new TextDecoder().decode(data)) as P2PMessage
}

// ─── Order validation ────────────────────────────────────────────────────────

export function validateOrder(order: P2POrder): string | null {
  if (!order.id        || typeof order.id        !== 'string') return 'missing id'
  if (!order.pairId    || typeof order.pairId    !== 'string') return 'missing pairId'
  if (!order.trader    || typeof order.trader    !== 'string') return 'missing trader'
  if (!order.signature || typeof order.signature !== 'string') return 'missing signature'
  if (order.side !== 'buy' && order.side !== 'sell')           return 'invalid side'
  if (order.price < 0)                                         return 'negative price'
  if (order.quantity <= 0)                                     return 'non-positive quantity'
  if (order.expiry !== 0 && order.expiry < Date.now() / 1000) return 'order expired'
  return null
}

export function validateCancel(payload: CancelPayload): string | null {
  if (!payload.orderId   || typeof payload.orderId   !== 'string') return 'missing orderId'
  if (!payload.signature || typeof payload.signature !== 'string') return 'missing signature'
  if (payload.deadline < Date.now() / 1000)                        return 'deadline passed'
  return null
}

export function validateFill(payload: FillPayload): string | null {
  if (!payload.buyOrderId  || typeof payload.buyOrderId  !== 'string') return 'missing buyOrderId'
  if (!payload.sellOrderId || typeof payload.sellOrderId !== 'string') return 'missing sellOrderId'
  if (payload.price    <= 0) return 'invalid price'
  if (payload.quantity <= 0) return 'invalid quantity'
  return null
}
