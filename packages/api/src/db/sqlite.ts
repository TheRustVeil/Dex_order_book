/**
 * Persistent JSON file store — drop-in replacement for a real DB.
 * Reads on startup, writes on every mutation (atomic rename).
 * Swap for pg/SQLite/Redis by reimplementing the 4 exported functions.
 */

import fs from 'fs'
import path from 'path'
import type { Order, Trade } from '../types/index.js'

const DATA_DIR     = path.join(process.cwd(), 'data')
const ORDERS_FILE  = path.join(DATA_DIR, 'orders.json')
const TRADES_FILE  = path.join(DATA_DIR, 'trades.json')

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })

// ── In-memory store (loaded from disk, flushed on writes) ─────────────────────

const ordersStore  = new Map<string, Order>()
const tradesStore: Trade[] = []

function loadFile<T>(file: string): T[] {
  try {
    if (!fs.existsSync(file)) return []
    const raw = fs.readFileSync(file, 'utf8').trim()
    return raw ? (JSON.parse(raw) as T[]) : []
  } catch {
    return []
  }
}

function writeFile(file: string, data: unknown): void {
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 0), 'utf8')
  fs.renameSync(tmp, file)
}

// ── Load existing data on startup ────────────────────────────────────────────

for (const o of loadFile<Order>(ORDERS_FILE)) ordersStore.set(o.id, o)
for (const t of loadFile<Trade>(TRADES_FILE)) tradesStore.push(t)

const orderCount = ordersStore.size
const tradeCount = tradesStore.length
if (orderCount || tradeCount)
  console.log(`[DB] Loaded ${orderCount} orders, ${tradeCount} trades from disk`)

// ── Public API (mirrors what a real DB client would expose) ───────────────────

export function saveOrder(order: Order): void {
  ordersStore.set(order.id, order)
  writeFile(ORDERS_FILE, [...ordersStore.values()])
}

export function updateOrderInDb(order: Pick<Order, 'id' | 'filled' | 'status' | 'updatedAt'>): void {
  const existing = ordersStore.get(order.id)
  if (!existing) return
  existing.filled    = order.filled
  existing.status    = order.status
  existing.updatedAt = order.updatedAt
  writeFile(ORDERS_FILE, [...ordersStore.values()])
}

export function saveTrade(trade: Trade): void {
  tradesStore.push(trade)
  writeFile(TRADES_FILE, tradesStore)
}

export function loadOpenOrders(): Order[] {
  return [...ordersStore.values()].filter(o => o.status === 'open' || o.status === 'partial')
}

export function loadAllOrders(): { all: Order[]; open: Order[] } {
  const all  = [...ordersStore.values()]
  const open = all.filter(o => o.status === 'open' || o.status === 'partial')
  return { all, open }
}
