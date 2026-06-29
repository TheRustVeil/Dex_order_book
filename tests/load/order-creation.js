/**
 * k6 Load Test — Order Creation
 *
 * Target: sustain 1000 concurrent users placing limit/market orders
 * Baseline pass criteria:
 *   - p95 latency < 500ms
 *   - p99 latency < 1000ms
 *   - error rate   < 1%
 *
 * Usage:
 *   k6 run tests/load/order-creation.js
 *   k6 run --out json=results/order-creation.json tests/load/order-creation.js
 */

import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'

// ─── Custom metrics ───────────────────────────────────────────────────────────

const orderErrors  = new Rate('order_errors')
const orderLatency = new Trend('order_latency_ms', true)

// ─── Options ─────────────────────────────────────────────────────────────────

export const options = {
  stages: [
    { duration: '30s',  target: 100  },   // ramp up to 100 VUs
    { duration: '1m',   target: 500  },   // ramp up to 500 VUs
    { duration: '2m',   target: 1000 },   // sustain 1000 VUs
    { duration: '30s',  target: 0    },   // ramp down
  ],
  thresholds: {
    'http_req_duration':       ['p(95)<500', 'p(99)<1000'],
    'http_req_failed':         ['rate<0.01'],
    'order_errors':            ['rate<0.01'],
    'order_latency_ms':        ['p(95)<500'],
  },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001'

const PAIRS = ['ETH-USDC', 'BTC-USDC', 'ETH-BTC']
const SIDES = ['buy', 'sell']
const TYPES = ['limit', 'market']

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randomPrice(base, spread = 0.02) {
  return +(base * (1 + (Math.random() - 0.5) * spread)).toFixed(2)
}

function randomQty() {
  return +(Math.random() * 2 + 0.01).toFixed(4)
}

function makeWallet() {
  // Pseudo-address for load testing — not a real wallet
  return '0x' + Math.random().toString(16).slice(2).padEnd(40, '0').slice(0, 40)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function () {
  const wallet  = makeWallet()
  const pairId  = randomItem(PAIRS)
  const side    = randomItem(SIDES)
  const type    = randomItem(TYPES)
  const price   = type === 'limit' ? randomPrice(2000) : 0
  const quantity = randomQty()

  const payload = JSON.stringify({
    trader:   wallet,
    pairId,
    side,
    type,
    price,
    quantity,
    expiry: 0,
  })

  const params = {
    headers: { 'Content-Type': 'application/json' },
    timeout: '10s',
  }

  const start = Date.now()
  const res = http.post(`${BASE_URL}/orders`, payload, params)
  const elapsed = Date.now() - start

  orderLatency.add(elapsed)

  const ok = check(res, {
    'status is 2xx':        (r) => r.status >= 200 && r.status < 300,
    'response has order':   (r) => {
      try { return !!JSON.parse(r.body).order } catch { return false }
    },
    'latency < 500ms':      () => elapsed < 500,
  })

  orderErrors.add(!ok)

  // Think time — realistic user pacing
  sleep(Math.random() * 0.5 + 0.1)
}

// ─── Summary ─────────────────────────────────────────────────────────────────

export function handleSummary(data) {
  return {
    'results/order-creation-summary.json': JSON.stringify(data, null, 2),
  }
}
