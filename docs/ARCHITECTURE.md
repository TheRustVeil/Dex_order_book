# System Architecture

> CONFIDENTIAL — ZeTheta Algorithms Private Limited
> All rights reserved. Do not distribute.

## Overview

ZeTheta DEX is a decentralized exchange combining an on-chain Central Limit Order Book (CLOB) with an off-chain matching engine, a LibP2P P2P network layer for order propagation, an AMM liquidity pool, and a full monitoring and indexing stack.

## Architecture Diagram

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                        BROWSER  (Next.js 14, TypeScript)                     ║
║                                                                              ║
║  ┌──────────────┐  ┌────────────┐  ┌────────────────┐  ┌────────────────┐  ║
║  │  OrderBook   │  │ PriceChart │  │   AMM Panel    │  │  Open Orders   │  ║
║  │  Panel + Bid │  │(TradingView│  │ Swap / Add Liq │  │  + History +   │  ║
║  │  Ask tables  │  │ LW Charts) │  │ Remove Liq     │  │  Cancel Btn    │  ║
║  └──────┬───────┘  └─────┬──────┘  └───────┬────────┘  └───────┬────────┘  ║
║         │                │                  │                    │           ║
║         └────────────────┴──────────────────┴────────────────────┘           ║
║                         Zustand State Store (dex.ts)                         ║
║                    useDexStream — SSE / Socket.IO client                     ║
╚═══════════════════════════════╦══════════════════════════════════════════════╝
                                │  HTTP REST / SSE / Socket.IO / GraphQL
╔═══════════════════════════════▼══════════════════════════════════════════════╗
║                    Next.js API Routes  +  packages/api  (Fastify)            ║
║                                                                              ║
║  REST                       GraphQL (Apollo v5)      Socket.IO               ║
║  POST /orders               query { orderBook }      orderbook:snapshot      ║
║  DELETE /orders/:id         query { trades }         trade:executed          ║
║  GET  /orders/history       subscription { … }       order:update (per-wallet)
║  GET  /orderbook/:pair                               subscribe:wallet room   ║
║  POST /amm/liquidity/add                                                     ║
║  POST /amm/liquidity/remove                                                  ║
║  GET  /metrics  (Prometheus)                                                 ║
║                                                                              ║
║  ┌────────────────────────────────────────────────────────────────────────┐  ║
║  │                  OrderBookService  (in-memory CLOB)                    │  ║
║  │  ┌─────────────────────┐  ┌────────────────────┐  ┌────────────────┐  │  ║
║  │  │   CLOB Engine       │  │   AMM Engine       │  │  Simulation    │  │  ║
║  │  │ price-time priority │  │ x·y=k, 0.30% fee  │  │  auto-ticker   │  │  ║
║  │  └─────────────────────┘  └────────────────────┘  └────────────────┘  │  ║
║  └────────────────────────────────────────────────────────────────────────┘  ║
╚══════════════════╦══════════════════════════════════════════════╦════════════╝
                   │                                              │
     ┌─────────────▼──────────────┐              ┌──────────────▼──────────────┐
     │   packages/p2p-network     │              │   packages/matching-engine   │
     │   LibP2P v3.3.4            │              │   TypeScript CLOB            │
     │   GossipSub (4 topics)     │              │   Price-time priority        │
     │   Kademlia DHT             │              │   Partial fills              │
     │   Noise + Yamux            │              │   Stop-limit orders          │
     │   mDNS + bootstrap         │              │   Self-trade prevention      │
     └────────────────────────────┘              └──────────────────────────────┘

╔══════════════════════════════════════════════════════════════════════════════╗
║             Ethereum / Sepolia Testnet  (Smart Contracts)                    ║
║                                                                              ║
║  ┌──────────────┐  ┌───────────────┐  ┌─────────────────┐                  ║
║  │OrderBook.sol │  │ Settlement.sol│  │TokenRegistry.sol│                  ║
║  │ EIP-712 sigs │  │ Escrow + fees │  │ Token whitelist │                  ║
║  │ MEV commit-  │  │ settleMatch() │  │ Pair registry   │                  ║
║  │ reveal       │  │ auto-trigger  │  └─────────────────┘                  ║
║  │ Struct pack  │  └───────────────┘                                        ║
║  └──────────────┘                                                            ║
║  ┌──────────────┐  ┌───────────────┐  ┌─────────────────┐                  ║
║  │LiquidityPool │  │  Factory.sol  │  │  FeeManager.sol │                  ║
║  │ x·y=k AMM   │  │ Deploys pools │  │ Fee distribution│                  ║
║  │ LP tokens    │  │ per pair      │  │ treasury/LP split│                 ║
║  │ IL tracking  │  └───────────────┘  └─────────────────┘                  ║
║  └──────────────┘                                                            ║
║  ┌──────────────────────────────────────────────────────────────────────┐   ║
║  │  The Graph — Subgraph indexing OrderBook + Settlement events         │   ║
║  │  schema.graphql: Order | Trade | Settlement | DailyVolume entities   │   ║
║  └──────────────────────────────────────────────────────────────────────┘   ║
╚══════════════════════════════════════════════════════════════════════════════╝

╔══════════════════════════════════════════════════════════════════════════════╗
║                     Infrastructure / DevOps                                  ║
║                                                                              ║
║  Docker Compose:                                                             ║
║  ┌────────────┐ ┌────────────┐ ┌───────────┐ ┌──────────┐ ┌─────────────┐ ║
║  │ frontend   │ │  backend   │ │ postgres  │ │  redis   │ │ prometheus  │ ║
║  │ :3000      │ │ :3001      │ │ :5432     │ │ :6379    │ │ :9090       │ ║
║  └────────────┘ └────────────┘ └───────────┘ └──────────┘ └──────┬──────┘ ║
║                                                                     │        ║
║  ┌──────────────────────────────────────────────────────────────────▼──────┐ ║
║  │  Grafana  :3003                                                         │ ║
║  │  dex-dashboard.json: orders/sec | latency p95/p99 | volume | WS clients│ ║
║  └─────────────────────────────────────────────────────────────────────────┘ ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

## Components

### 1. Frontend (`packages/frontend/`)

- **Framework:** Next.js 14 App Router, TypeScript, Tailwind CSS
- **State:** Zustand store (`src/store/dex.ts`) — snapshot, trades, AMM pool, LP position, wallet
- **Real-time:** SSE via `useDexStream` hook + Socket.IO (per-wallet rooms)
- **Wallet:** MetaMask via `window.ethereum` direct (no wagmi/viem dependencies)
- **Charts:**
  - `PriceChart` — lightweight-charts OHLCV candlestick
  - `DepthChart` — Recharts cumulative depth
  - `SpreadChart` — Recharts bid-ask spread over time
  - `VolumeChart` — Recharts 1-minute stacked bar (buy/sell volume)
  - `ILCalculator` — Recharts IL curve
- **New UI panels (Q2 2026):**
  - `OpenOrdersTable` — live open orders with Cancel button
  - `OrderHistory` — paginated filled/cancelled order history
  - `AddLiquidity` / `RemoveLiquidity` — LP management forms with slippage control
  - `LPBalance` — real-time LP token balance + pool share + IL

### 2. Off-chain Matching Engine (`packages/matching-engine/`)

- **Algorithm:** Price-time priority CLOB
  - Bids sorted descending by price (highest bid first), FIFO within same price
  - Asks sorted ascending by price (lowest ask first), FIFO within same price
- **Order types:** LIMIT, MARKET, STOP_LIMIT
- **Partial fills:** Tracked via `filled` quantity field
- **Self-trade prevention:** Skips orders from the same trader

### 3. AMM Engine

- **Formula:** Constant product `x × y = k` (Uniswap v2 compatible)
- **Fee:** 30 bps (0.30%) applied to amountIn before k-product swap
- **IL formula:** `IL = 2√r / (1 + r) − 1` where `r = P_current / P_entry`

### 4. Smart Contracts (`packages/contracts/`)

| Contract | Purpose | Key Features |
|---|---|---|
| `OrderBook.sol` | On-chain CLOB | EIP-712 signatures, MEV commit-reveal, struct-packed Order |
| `Settlement.sol` | Atomic token swap | Escrow, slippage guards, auto-trigger on match via `settleMatch()` |
| `TokenRegistry.sol` | Whitelist + pairs | `addToken()`, `createPair()`, `isPairActive()` |
| `LiquidityPool.sol` | AMM per pair | x·y=k, 30 bps fee, IL tracking, LP ERC-20 |
| `Factory.sol` | Deploys LP pools | `createPair()` deploys and tracks pool per pair |
| `FeeManager.sol` | Fee distribution | Pulls from Settlement, splits treasury/LP |

**Security patterns:**
- `ReentrancyGuard` on all state-changing functions
- `Pausable` (emergency stop) on all contracts
- EIP-712 typed data for off-chain order signatures
- MEV protection via commit-reveal (OrderBook)
- Struct packing: `trader+side+orderType+status` packed into one storage slot

### 5. P2P Network (`packages/p2p-network/`)

- **Protocol:** LibP2P v3.3.4
- **Transports:** TCP + WebSockets
- **Encryption:** Noise protocol
- **Multiplexing:** Yamux
- **Peer discovery:** mDNS (local) + bootstrap peers (public)
- **Pub/Sub:** GossipSub (topics: `orders`, `cancels`, `fills`, `sync`)
- **Content routing:** Kademlia DHT (`/zetheta-dex/kad/1.0.0`)
  - `announcePair(pairId)` — advertise as provider for a trading pair
  - `findPairPeers(pairId)` — discover peers with orders for a pair
- **DOS protection:** 20 msg/sec/peer rate limit + 50 peer max connections
- **Duplicate detection:** SHA-256 msgId seen-cache (capped at 10k)

### 6. API (`packages/api/`)

- **Framework:** Fastify + Apollo Server v5 + Socket.IO
- **Rate limiting:** 60 req/min sliding window per wallet address
- **GraphQL:** `orderBook`, `orders`, `order`, `trades`, `stats` queries + subscriptions
- **Socket.IO rooms:**
  - Global: `orderbook:snapshot`, `trade:executed`
  - Per-wallet: `wallet:{address}` room → `order:update` events

## Data Flow

### Order Placement (simulation mode)

```
User fills OrderForm
  → POST /api/orderbook/order  (REST)
  → OrderBookService.placeOrder()
  → CLOB._match()  (price-time priority sweep)
  → If match: trade emitted + orderUpdateCallbacks fired
  → Socket.IO: io.emit('orderbook:snapshot')   [global]
  →            io.to(walletRoom).emit('order:update')  [per-wallet]
  → Zustand store updated → React re-renders
```

### AMM Swap

```
User enters amountIn
  → POST /api/amm/swap { dryRun: true }   ← dry-run quote
  → AMMEngine.quoteSwap()  → { amountOut, priceImpact, effectivePrice, fee }
  → User clicks Swap
  → POST /api/amm/swap { dryRun: false }
  → AMMEngine.executeSwap()  → reserves updated (x·y=k)
  → SSE/Socket.IO snapshot broadcast
```

### P2P Order Propagation

```
Local node places order
  → DexP2PNode.broadcastOrder(order)
  → GossipSub.publish(ORDER_TOPIC, encoded)
  → DHT.provide(pairKey)  [announce as provider]
  → Remote peers receive via GossipSub handler
  → Validate → store.put(order) → onNewOrder() callback
  → Remote matching engine can pick up the order
```

## Security Considerations

1. **MEV protection:** `commitOrder()` hides order params behind a hash. Reveal after ≥1 block gap.
2. **Replay protection:** Per-trader nonces on all EIP-712 signed messages.
3. **Slippage guards:** `minBaseOut` / `minQuoteOut` on all Settlement calls.
4. **Reentrancy:** All state-changing functions use `ReentrancyGuard`.
5. **Emergency stop:** Owner can `pause()` any contract; no new orders accepted while paused.
6. **Rate limiting:** 60 REST req/min per wallet; 20 P2P msg/sec per peer.
7. **Input validation:** All order params validated at API boundary before engine.

## Performance Targets

| Metric | Target | Test Method |
|---|---|---|
| Order placement latency | p95 < 500ms | k6 order-creation.js |
| Order book read latency | p95 < 100ms | k6 orderbook-read.js |
| Concurrent WebSocket clients | 1000 | k6 orderbook-read.js ws_subscribers |
| On-chain placeOrder gas | < 350k gas | hardhat-gas-reporter |
| On-chain swap gas | < 100k gas | hardhat-gas-reporter |
