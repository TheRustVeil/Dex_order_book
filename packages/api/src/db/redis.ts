/**
 * Redis key design for ZeTheta DEX.
 *
 * Sorted sets (ZADD score=price, member=orderId):
 *   dex:ob:{pairId}:bids   — active buy orders, score = price (high score = best bid)
 *   dex:ob:{pairId}:asks   — active sell orders, score = price (low score = best ask)
 *
 * Hash (order detail):
 *   dex:order:{orderId}    — all Order fields as hash fields
 *
 * Set (per-user open orders):
 *   dex:trader:{address}:open  — set of open orderIds
 *
 * Rate limit counters (expire after 60s):
 *   dex:rl:{address}       — request count in current window
 *
 * Pub/Sub channels:
 *   dex:events:trade       — trade event JSON
 *   dex:events:snapshot    — order book snapshot JSON
 */

import IORedis from 'ioredis'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'

export const redis = new IORedis(REDIS_URL, { lazyConnect: true })

// ── Keys ─────────────────────────────────────────────────────────────────────

export const keys = {
  bids:       (pairId: string) => `dex:ob:${pairId}:bids`,
  asks:       (pairId: string) => `dex:ob:${pairId}:asks`,
  orderHash:  (orderId: string) => `dex:order:${orderId}`,
  traderOpen: (address: string) => `dex:trader:${address.toLowerCase()}:open`,
  rateLimit:  (address: string) => `dex:rl:${address.toLowerCase()}`,
}

export const channels = {
  trade:    'dex:events:trade',
  snapshot: 'dex:events:snapshot',
}

// ── Order book helpers ────────────────────────────────────────────────────────

export async function addBid(pairId: string, orderId: string, price: number): Promise<void> {
  await redis.zadd(keys.bids(pairId), price, orderId)
}

export async function addAsk(pairId: string, orderId: string, price: number): Promise<void> {
  await redis.zadd(keys.asks(pairId), price, orderId)
}

export async function removeBid(pairId: string, orderId: string): Promise<void> {
  await redis.zrem(keys.bids(pairId), orderId)
}

export async function removeAsk(pairId: string, orderId: string): Promise<void> {
  await redis.zrem(keys.asks(pairId), orderId)
}

// Best bid = highest price = last element in ascending sorted set
export async function getBestBid(pairId: string): Promise<number | null> {
  const [id, score] = await redis.zrange(keys.bids(pairId), -1, -1, 'WITHSCORES')
  return id ? parseFloat(score) : null
}

// Best ask = lowest price = first element in ascending sorted set
export async function getBestAsk(pairId: string): Promise<number | null> {
  const [id, score] = await redis.zrange(keys.asks(pairId), 0, 0, 'WITHSCORES')
  return id ? parseFloat(score) : null
}

// ── Rate limiter ──────────────────────────────────────────────────────────────

export async function checkRateLimitRedis(
  address: string,
  max = 60,
  windowSec = 60
): Promise<boolean> {
  const k     = keys.rateLimit(address)
  const count = await redis.incr(k)
  if (count === 1) await redis.expire(k, windowSec)
  return count <= max
}
