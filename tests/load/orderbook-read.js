/**
 * k6 Load Test — Order Book Read (GET /orderbook/:pair)
 *
 * Simulates 1000 concurrent frontend clients polling the live order book.
 * Also tests the snapshot WebSocket endpoint with concurrent connections.
 *
 * Target:
 *   - p95 GET latency < 100ms (cached reads should be fast)
 *   - p99 GET latency < 250ms
 *   - error rate       < 0.5%
 *
 * Usage:
 *   k6 run tests/load/orderbook-read.js
 *   k6 run --out json=results/orderbook-read.json tests/load/orderbook-read.js
 */

import http from 'k6/http'
import ws   from 'k6/ws'
import { check, sleep } from 'k6'
import { Rate, Trend, Counter } from 'k6/metrics'

// ─── Custom metrics ───────────────────────────────────────────────────────────

const readErrors      = new Rate('orderbook_read_errors')
const readLatency     = new Trend('orderbook_read_latency_ms', true)
const snapshotsRx     = new Counter('snapshots_received')
const wsConnErrors    = new Rate('ws_connection_errors')

// ─── Options ─────────────────────────────────────────────────────────────────

export const options = {
  scenarios: {
    // Scenario 1: REST polling clients
    rest_readers: {
      executor: 'ramping-vus',
      stages: [
        { duration: '20s', target: 200  },
        { duration: '1m',  target: 700  },
        { duration: '2m',  target: 1000 },
        { duration: '20s', target: 0    },
      ],
      exec: 'restRead',
    },

    // Scenario 2: WebSocket subscribers (starts after REST warm-up)
    ws_subscribers: {
      executor: 'constant-vus',
      vus:      200,
      duration: '3m',
      startTime: '20s',
      exec: 'wsSubscribe',
    },
  },

  thresholds: {
    'http_req_duration':               ['p(95)<100', 'p(99)<250'],
    'http_req_failed':                 ['rate<0.005'],
    'orderbook_read_errors':           ['rate<0.005'],
    'orderbook_read_latency_ms':       ['p(95)<100'],
    'ws_connection_errors':            ['rate<0.01'],
  },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001'
const WS_URL   = BASE_URL.replace(/^http/, 'ws')
const PAIRS    = ['ETH-USDC', 'BTC-USDC', 'ETH-BTC']

function randomPair() {
  return PAIRS[Math.floor(Math.random() * PAIRS.length)]
}

// ─── Scenario: REST read ──────────────────────────────────────────────────────

export function restRead() {
  const pair = randomPair()

  const start = Date.now()
  const res   = http.get(`${BASE_URL}/orderbook/${pair}`, {
    timeout: '5s',
    headers: { 'Accept': 'application/json' },
  })
  const elapsed = Date.now() - start

  readLatency.add(elapsed)

  const ok = check(res, {
    'status 200':               (r) => r.status === 200,
    'has bids array':           (r) => {
      try { return Array.isArray(JSON.parse(r.body).bids) } catch { return false }
    },
    'has asks array':           (r) => {
      try { return Array.isArray(JSON.parse(r.body).asks) } catch { return false }
    },
    'latency < 100ms':          () => elapsed < 100,
  })

  readErrors.add(!ok)

  // Simulate client polling interval (500ms–2s)
  sleep(Math.random() * 1.5 + 0.5)
}

// ─── Scenario: WebSocket subscribe ───────────────────────────────────────────

export function wsSubscribe() {
  let connected = false

  const res = ws.connect(`${WS_URL}`, {}, function (socket) {
    socket.on('open', () => {
      connected = true
      // Subscribe to order book feed
      socket.send(JSON.stringify({ event: 'subscribe:orderbook' }))
    })

    socket.on('message', (data) => {
      try {
        const msg = JSON.parse(data)
        if (msg.event === 'orderbook:snapshot' || msg.bids) {
          snapshotsRx.add(1)
          check(msg, {
            'snapshot has bids': (m) => Array.isArray(m.bids),
            'snapshot has asks': (m) => Array.isArray(m.asks),
          })
        }
      } catch {}
    })

    socket.on('error', () => {
      wsConnErrors.add(1)
    })

    // Keep connection alive for 30 seconds then close
    socket.setTimeout(() => {
      socket.close()
    }, 30_000)
  })

  wsConnErrors.add(!connected || res.status !== 101)
}
