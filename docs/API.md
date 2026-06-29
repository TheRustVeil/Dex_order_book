# API Reference

> CONFIDENTIAL — ZeTheta Algorithms Private Limited

Base URL: `http://localhost:3000/api`

---

## Order Book

### `GET /orderbook/stream`

Server-Sent Events stream. Connect once; the server pushes updates whenever the order book or simulation state changes.

**Response stream format:**
```
data: {"type":"snapshot","snapshot":{...},"trades":[...],"ammPool":{...},"spreadHistory":[...],"candles":[...]}
```

**Event types:**

| type | Description |
|---|---|
| `snapshot` | Full order book state + recent trades + AMM pool |

**Snapshot payload:**
```ts
{
  type: 'snapshot',
  snapshot: {
    bids: Array<{ price: number; quantity: number; total: number }>,
    asks: Array<{ price: number; quantity: number; total: number }>,
    midPrice: number,
    spread: number,
    spreadPct: number
  },
  trades: Array<{
    id: string; price: number; quantity: number;
    side: 'buy' | 'sell'; timestamp: number
  }>,
  ammPool: {
    reserveBase: number; reserveQuote: number;
    k: number; price: number; feeBps: number
  },
  spreadHistory: Array<{ timestamp: number; spread: number; spreadPct: number }>,
  candles: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>
}
```

---

### `POST /orderbook/order`

Place a new limit or market order.

**Request body:**
```json
{
  "side": "buy" | "sell",
  "type": "limit" | "market",
  "price": 2050.00,
  "quantity": 0.5
}
```

**Response:**
```json
{
  "success": true,
  "orderId": "ORD-000042",
  "trades": [
    { "id": "TRD-001", "price": 2050, "quantity": 0.5, "side": "buy", "timestamp": 1718000000000 }
  ]
}
```

**Error:**
```json
{ "error": "Price required for limit orders" }
```

---

### `DELETE /orderbook/order`

Cancel an open order.

**Request body:**
```json
{ "orderId": "ORD-000042" }
```

**Response:**
```json
{ "success": true }
```

---

## AMM

### `POST /amm/swap`

Get a quote or execute a swap.

**Request body:**
```json
{
  "inputToken": "ETH",
  "outputToken": "USDC",
  "inputAmount": 1.0,
  "dryRun": true
}
```

Set `dryRun: false` to execute (modifies reserves).

**Response:**
```json
{
  "success": true,
  "outputAmount": 2015.32,
  "priceImpact": 0.48,
  "effectivePrice": 2015.32,
  "fee": 6.05
}
```

---

### `GET /amm/liquidity`

Get current pool state and IL curve data.

**Response:**
```json
{
  "pool": {
    "reserveBase": 100.0,
    "reserveQuote": 200000.0,
    "k": 20000000,
    "price": 2000,
    "feeBps": 30
  },
  "ilCurve": [
    { "priceRatio": 0.5, "il": -5.72 },
    { "priceRatio": 1.0, "il": 0 },
    { "priceRatio": 2.0, "il": -5.72 }
  ]
}
```

---

### `POST /amm/liquidity`

Add liquidity to the pool.

**Request body:**
```json
{
  "amountBase": 1.0,
  "amountQuote": 2000.0
}
```

**Response:**
```json
{
  "success": true,
  "lpPosition": {
    "amountBase": 1.0,
    "amountQuote": 2000.0,
    "entryPrice": 2000,
    "lpShares": 44.72,
    "entryTimestamp": 1718000000000
  }
}
```

---

### `POST /amm/il`

Calculate impermanent loss for a given LP position.

**Request body:**
```json
{
  "position": {
    "amountBase": 1.0,
    "amountQuote": 2000.0,
    "entryPrice": 2000,
    "lpShares": 44.72,
    "entryTimestamp": 1718000000000
  }
}
```

**Response:**
```json
{
  "success": true,
  "ilResult": {
    "currentPrice": 2200,
    "entryPrice": 2000,
    "priceRatio": 1.1,
    "ilPct": -0.23,
    "hodlValue": 4200,
    "lpValue": 4190.31,
    "lossUsd": -9.69
  },
  "ilCurve": [...]
}
```
