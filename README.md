# ZeTheta DEX Order Book

> **CONFIDENTIAL — ZeTheta Algorithms Private Limited**
>
> This repository and all its contents are the exclusive intellectual property of ZeTheta Algorithms Private Limited. Unauthorized copying, distribution, or use of any part of this codebase is strictly prohibited. All interns and contributors are bound by the Non-Disclosure Agreement (NDA) signed at the start of the internship program. **Host only in a private repository.**

---

## Project 1B: Decentralized Order Book Builder

A full-stack decentralized exchange (DEX) that combines a **Central Limit Order Book (CLOB)** with an **Automated Market Maker (AMM)**, real-time market-data streaming, on-chain settlement, and live trading visualizations.

It is a working system, not a mock-up: orders placed in the UI are matched by a real in-process matching engine, persisted to disk, streamed back to every connected client over Server-Sent Events, and can be settled on-chain through MetaMask against contracts deployed on the Sepolia testnet.

---

## Table of Contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [How It Works (End to End)](#how-it-works-end-to-end)
4. [Tech Stack](#tech-stack)
5. [Project Structure](#project-structure)
6. [Quick Start](#quick-start)
7. [Running on Windows](#running-on-windows)
8. [Environment Variables](#environment-variables)
9. [Smart Contracts](#smart-contracts)
10. [API Reference](#api-reference)
11. [Testing](#testing)
12. [Docker](#docker)
13. [Troubleshooting](#troubleshooting)

---

## Features

- **CLOB Matching Engine** — Price-time priority (FIFO within a price level), limit & market orders, partial fills, self-trade prevention.
- **AMM Pool** — Uniswap-style constant-product formula (x·y=k) with a configurable fee tier, swap routing, and liquidity provision.
- **Hybrid Routing** — Orders can be filled against the order book, the AMM pool, or a blend of both.
- **Real-time Streaming** — A single Server-Sent Events (SSE) channel pushes order-book snapshots, trades, AMM state, spread history, and candles to every client instantly.
- **Price Discovery** — Live candlestick chart, mid-price, and spread-dynamics tracking.
- **Impermanent Loss Calculator** — Real-time IL curve and LP position tracker.
- **On-chain Settlement** — Connect MetaMask and settle trades against Sepolia contracts via ethers v6; the transaction hash appears in the status bar.
- **Order Depth & Spread Charts** — Visualize liquidity depth and spread over time.
- **Persistence** — Orders and trades survive an API restart (JSON file store).

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         Browser (Next.js frontend)                         │
│                                                                            │
│   Trade UI ──REST (place/cancel orders, AMM swaps)──┐                      │
│   Charts/Book ◀── SSE /stream (live market data) ───┤                      │
│   Settlement ──ethers v6 + MetaMask──┐              │                      │
└──────────────────────────────────────┼──────────────┼─────────────────────┘
                                        │              │
                                        │              ▼
                                        │   ┌──────────────────────────────┐
                                        │   │     API server (Fastify)     │
                                        │   │                              │
                                        │   │  REST + GraphQL + Socket.IO  │
                                        │   │  SSE broadcaster (/stream)   │
                                        │   │  Rate limiting, Prometheus   │
                                        │   │            │                 │
                                        │   │            ▼                 │
                                        │   │  Matching Engine (CLOB)      │
                                        │   │  AMM service (x·y=k)         │
                                        │   │  JSON file persistence       │
                                        │   │  (optional libp2p P2P relay) │
                                        │   └──────────────────────────────┘
                                        ▼
                            ┌──────────────────────────────┐
                            │   Sepolia / Hardhat chain    │
                            │  OrderBook · Settlement ·    │
                            │  Factory · LiquidityPool ·   │
                            │  TokenRegistry · FeeManager  │
                            └──────────────────────────────┘
```

- **Frontend** (`packages/frontend`) — Next.js 14 app. State lives in a Zustand store; the `useDexStream` hook opens one `EventSource` to the API's `/stream` endpoint and fans incoming messages into the store.
- **API** (`packages/api`) — Fastify server exposing REST endpoints, an Apollo GraphQL endpoint, a Socket.IO channel, and the SSE `/stream` broadcaster. It owns the matching engine and AMM singletons.
- **Matching Engine** (`packages/matching-engine`) — Pure-TypeScript CLOB used directly by the API.
- **Contracts** (`packages/contracts`) — Solidity 0.8.24 (Hardhat) for on-chain settlement.
- **P2P / Subgraph** (`packages/p2p-network`, `packages/subgraph`) — Optional libp2p order propagation and a Graph subgraph for event indexing.

---

## How It Works (End to End)

1. **Connect wallet.** The UI uses `window.ethereum` (MetaMask) directly to read the account and chain. The wallet is only required for on-chain settlement — market data flows regardless of wallet state.
2. **Live data.** On load, the frontend opens `EventSource(${NEXT_PUBLIC_API_URL}/stream)`. The API immediately sends a `snapshot`, recent `trades`, the `amm` pool, `spread` history, and `candles`, then pushes incremental updates on every simulation tick and every order event. When this connection is healthy the status bar reads **"Live"**; if it cannot reach the endpoint it shows **"Reconnecting…"** and retries every 3s.
3. **Place an order.** The order form POSTs to `/orders`. The API hands it to the matching engine, which applies price-time priority, produces fills, persists state, and broadcasts the new snapshot/trades to all SSE clients.
4. **AMM swaps & liquidity.** The AMM panel calls `/amm/swap`, `/amm/liquidity/add`, and `/amm/liquidity/remove`; pool state is broadcast over the same stream.
5. **Settle on-chain.** From the settlement flow, ethers v6 calls `settleTrade` on the Sepolia `Settlement` contract through MetaMask; the resulting tx hash is shown in the status bar.

> **Key dependency:** the frontend is useless without the API. If everything shows "Connecting…"/"Reconnecting…", the API is not reachable at `NEXT_PUBLIC_API_URL` — see [Troubleshooting](#troubleshooting).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, React, TypeScript, Tailwind CSS, Zustand |
| Charts | lightweight-charts (candlestick), Recharts (depth, spread, IL) |
| Wallet | Direct `window.ethereum` (MetaMask) + ethers v6 |
| API | Fastify 5 · Apollo Server (GraphQL) · Socket.IO · SSE |
| Engine | In-process CLOB + AMM singletons (Node.js / TypeScript) |
| Persistence | JSON file store (`packages/api/data/`) |
| Smart Contracts | Solidity 0.8.24, Hardhat |
| P2P (optional) | libp2p + GossipSub |
| Indexing (optional) | The Graph subgraph |
| Tooling | pnpm workspaces, Turborepo, Docker Compose |

---

## Project Structure

```
zetheta-dex-orderbook/
├── packages/
│   ├── contracts/          # Solidity smart contracts (Hardhat) + deployments/
│   ├── frontend/           # Next.js 14 app (the trading UI)
│   ├── matching-engine/    # Standalone CLOB engine package
│   ├── p2p-network/        # libp2p gossip network layer (optional)
│   ├── api/                # Fastify REST + GraphQL + SSE backend
│   └── subgraph/           # The Graph subgraph (event indexing)
├── docker/                 # Dockerfiles + docker-compose.yml
├── docs/                   # Architecture / API / contract notes
├── scripts/                # setup / deploy / test helpers
├── tests/
├── .github/workflows/      # CI workflows
├── turbo.json
├── pnpm-workspace.yaml
├── .env.example            # Copy to .env and fill in
└── README.md               ← you are here
```

---

## Quick Start

> Requires **Node ≥ 20** and **pnpm**. Two processes must run: the **API** and the **frontend**.

```bash
# 1. Install dependencies
pnpm install

# 2. Create your env file and fill in values
cp .env.example .env

# 3. Start the API (default port 3001)
cd packages/api && pnpm start:dev      # ts-node src/main.ts

# 4. In a second terminal, start the frontend (default port 3000)
cd packages/frontend && pnpm dev

# 5. Open the app
#    http://localhost:3000  →  click "Enter Exchange"  →  /trade
```

The frontend talks to the API via `NEXT_PUBLIC_API_URL` (default `http://localhost:3001`). If you run the API on a different port, set that variable accordingly (see below).

---

## Running on Windows

This project is developed on Windows; a few quirks matter:

- **Use `pnpm`, not `npm`.**
- **Start the API** (port 3001 by default):
  ```powershell
  cd packages\api
  $env:P2P_ENABLED="0"; node_modules\.bin\ts-node --transpile-only src/main.ts
  ```
- **Start the frontend** with an increased Node heap (the default ~1.5 GB is too small for Next.js here):
  ```powershell
  cd packages\frontend
  node --max-old-space-size=4096 node_modules\next\dist\bin\next dev --port 3000
  ```
- **Running the API on a non-default port:** set `PORT` for the API and `NEXT_PUBLIC_API_URL` for the frontend so they match. Frontend env can go in `packages/frontend/.env.local`:
  ```
  NEXT_PUBLIC_API_URL=http://localhost:3002
  ```
  `NEXT_PUBLIC_*` variables are read when the dev server starts, so restart the frontend after changing them.

`start-api.bat` and `start-frontend.bat` at the repo root wrap these commands.

---

## Environment Variables

Copy `.env.example` → `.env`. **Never commit `.env` or `.env.local`** — they are gitignored.

| Variable | Purpose |
|---|---|
| `PRIVATE_KEY` | Deployer key for Hardhat/Sepolia deploys. **Keep secret.** |
| `SEPOLIA_RPC_URL` | RPC endpoint for the Sepolia testnet |
| `ETHERSCAN_API_KEY` | Contract verification (optional) |
| `PORT` | API server port (default `3001`) |
| `P2P_ENABLED` | `0` to disable the libp2p relay (recommended for local dev) |
| `NEXT_PUBLIC_API_URL` | Where the frontend reaches the API (REST + SSE) |
| `NEXT_PUBLIC_CHAIN_ID` | `11155111` (Sepolia) or `31337` (Hardhat local) |
| `NEXT_PUBLIC_*_CONTRACT` | Deployed contract addresses used by the UI |
| `DATABASE_URL` / `REDIS_URL` | Only needed for the full Docker stack |

---

## Smart Contracts

Six Solidity contracts in `packages/contracts/contracts/`:

| Contract | Description |
|---|---|
| `OrderBook.sol` | EIP-712 signed orders, on-chain matching, gasless cancel |
| `Settlement.sol` | Escrow + atomic settlement with slippage protection |
| `TokenRegistry.sol` | Token whitelist and trading-pair registry |
| `LiquidityPool.sol` | x·y=k AMM, LP token, impermanent-loss tracking |
| `Factory.sol` | Deploys and indexes `LiquidityPool` instances |
| `FeeManager.sol` | Distributes the 0.30% fee to treasury + LP reward pool |

### Deployed Addresses

**Sepolia (chain 11155111):**

| Contract | Address |
|---|---|
| TokenRegistry | `0xE94D84Ab1fC4D39fB1c4868B388AE4300Dc9a407` |
| Settlement | `0x63297Fc01bA595cB144816905659C9a92E94Fd89` |
| FeeManager | `0x73E1Cd0e868299F3aD9201748a3b643FCE1482EE` |
| Factory | `0x4F8ff85d11d9EBc7CE7Bf3C1CB667d20A8fE3168` |
| OrderBook | `0xC37A09aa53464452a73898e378734A26dFF1a053` |

**Hardhat local (chain 31337, deterministic):**

| Contract | Address |
|---|---|
| TokenRegistry | `0x5FbDB2315678afecb367f032d93F642f64180aa3` |
| Settlement | `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512` |
| FeeManager | `0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0` |
| Factory | `0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9` |
| OrderBook | `0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9` |

Deploy commands:

```bash
cd packages/contracts
pnpm hardhat node                 # local chain (terminal 1)
pnpm hardhat run scripts/deploy.ts --network localhost   # (terminal 2)
pnpm hardhat run scripts/deploy.ts --network sepolia      # testnet
```

---

## API Reference

Base URL: `http://localhost:3001` (configurable via `PORT`).

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Liveness probe |
| `GET` | `/stream` | **SSE** market-data feed (snapshot, trades, amm, spread, candles) |
| `POST` | `/orders` | Place a limit/market order |
| `GET` | `/orders?trader=&status=` | Open orders for a trader |
| `GET` | `/orders/history?trader=&limit=&offset=` | Order history (paginated) |
| `DELETE` | `/orders/:id` | Cancel an order |
| `GET` | `/orderbook/:pair?depth=` | Order-book snapshot for a pair |
| `POST` | `/amm/swap` | Quote/execute an AMM swap |
| `POST` | `/amm/liquidity/add` · `/amm/liquidity/remove` | Manage LP positions |
| `GET` | `/amm/pool` · `/amm/position?wallet=` · `/amm/il` | Pool state / position / IL |
| `POST`,`GET` | `/graphql` | Apollo GraphQL endpoint |
| `GET` | `/metrics` | Prometheus metrics |

- Real-time also available over **Socket.IO** (wallet rooms via `subscribe:wallet`).
- Rate limiting is applied per wallet address.

---

## Testing

```bash
# Smart-contract tests (Hardhat)
cd packages/contracts && pnpm test

# Gas report
cd packages/contracts && REPORT_GAS=true pnpm test

# Matching-engine tests
cd packages/matching-engine && pnpm test

# Everything, via Turborepo
pnpm test
```

Contract test suites cover `OrderBook`, `Settlement`, `Factory`, `FeeManager`, `LiquidityPool`, `TokenRegistry`, and an end-to-end `Integration` suite.

---

## Docker

```bash
cd docker && docker compose up --build
# frontend    → http://localhost:3000
# API         → http://localhost:3001
# Prometheus  → http://localhost:9090
# Grafana     → http://localhost:3003   (admin / dexadmin)
```

Notes:
- `NEXT_PUBLIC_*` values are baked in at **build time** (set them as build args, not runtime env).
- `NEXT_PUBLIC_API_URL` must point at the host-exposed API port (the browser connects to it, not the internal service hostname).
- `P2P_ENABLED=0` in Docker (libp2p is not viable on the bridge network).

---

## Troubleshooting

**Everything shows "Connecting…" / "Reconnecting…" after loading `/trade`.**
The frontend cannot reach the API's `/stream` endpoint. Check:
1. The API is actually running: `curl http://localhost:3001/health` should return `{"status":"ok",...}`.
2. The API on that port is *this* project's API (a `/health` response with a numeric `timestamp`), not another app squatting on the port.
3. `NEXT_PUBLIC_API_URL` matches the API's real port; restart the frontend after changing it.
4. After fixing, **hard-refresh** the browser (Ctrl+Shift+R) — the old tab holds a stale bundle pointing at the old URL.

**MetaMask connects but no data appears.** The wallet is independent of market data; this is almost always the API/stream issue above, not the wallet.

**Next.js dev server crashes / "client-side exception" on Windows.** Use an uppercase drive letter in the path and the `--max-old-space-size=4096` flag (see [Running on Windows](#running-on-windows)).

---

**Intern:** Submit the **private** GitHub repository link to `@ZethetaIntern` by Day 15.

**Confidentiality Notice:** Do not share, publish, or open-source any portion of this project without written permission from ZeTheta Algorithms Private Limited.
