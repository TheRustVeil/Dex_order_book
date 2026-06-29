import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client'

export const registry = new Registry()

collectDefaultMetrics({ register: registry })

// Orders placed
export const ordersPlaced = new Counter({
  name:    'dex_orders_placed_total',
  help:    'Total number of orders placed',
  labelNames: ['side', 'type'],
  registers: [registry],
})

// Trades executed
export const tradesExecuted = new Counter({
  name:    'dex_trades_executed_total',
  help:    'Total number of trades executed',
  registers: [registry],
})

// Order volume (in USDC)
export const tradeVolume = new Counter({
  name:    'dex_trade_volume_usd_total',
  help:    'Cumulative trade volume in USD',
  registers: [registry],
})

// Active open orders
export const openOrders = new Gauge({
  name:    'dex_open_orders',
  help:    'Number of currently open orders',
  registers: [registry],
})

// REST request latency
export const httpRequestDuration = new Histogram({
  name:    'dex_http_request_duration_seconds',
  help:    'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [registry],
})

// Order matching latency
export const matchingLatency = new Histogram({
  name:    'dex_matching_latency_seconds',
  help:    'Order matching engine latency in seconds',
  buckets: [0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05],
  registers: [registry],
})

// Connected WebSocket clients
export const wsClients = new Gauge({
  name:    'dex_websocket_clients',
  help:    'Number of connected Socket.IO clients',
  registers: [registry],
})
