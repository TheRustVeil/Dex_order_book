import type { P2POrder } from '../types/index.js'

export class OrderStore {
  private orders: Map<string, P2POrder> = new Map()
  // Seen message IDs for deduplication (capped at 10k to limit memory)
  private seenMsgIds: Set<string> = new Set()
  private readonly MAX_SEEN = 10_000

  // ─── Deduplication ────────────────────────────────────────────────────────

  hasSeen(msgId: string): boolean {
    return this.seenMsgIds.has(msgId)
  }

  markSeen(msgId: string): void {
    if (this.seenMsgIds.size >= this.MAX_SEEN) {
      // Evict oldest entry (first inserted)
      const first = this.seenMsgIds.values().next().value
      if (first !== undefined) this.seenMsgIds.delete(first)
    }
    this.seenMsgIds.add(msgId)
  }

  // ─── Orders ───────────────────────────────────────────────────────────────

  put(order: P2POrder): void {
    this.orders.set(order.id, order)
  }

  get(id: string): P2POrder | undefined {
    return this.orders.get(id)
  }

  getAll(): P2POrder[] {
    return Array.from(this.orders.values())
  }

  getSince(fromTimestamp: number, pairIds?: string[]): P2POrder[] {
    return this.getAll().filter(o =>
      o.timestamp >= fromTimestamp &&
      (pairIds == null || pairIds.length === 0 || pairIds.includes(o.pairId))
    )
  }

  remove(id: string): void {
    this.orders.delete(id)
  }

  size(): number {
    return this.orders.size
  }
}
