# Video Demo Script — ZeTheta DEX (Project 1B)

> CONFIDENTIAL — ZeTheta Algorithms Private Limited
> For internal demo purposes only. Do not publish or share externally.

---

## Recording Setup

- **Resolution:** 1920×1080 (1080p)
- **Browser:** Chrome, DevTools closed
- **Font size:** ~14–16px system-wide (readable on playback)
- **Mic:** On — narrate each section
- **Duration target:** 8–12 minutes
- **Start:** `pnpm dev` running; browser at `http://localhost:3000`

---

## Section 1 — Introduction (0:00–1:00)

**On screen:** DEX landing page — order book + price chart visible

**Say:**
> "This is ZeTheta DEX, a Decentralized Order Book built during Project 1B at ZeTheta Algorithms.
> It combines a Central Limit Order Book, or CLOB, with an AMM liquidity pool,
> a P2P network for order propagation, and six Solidity smart contracts on Sepolia testnet.
> Let me walk you through each layer."

---

## Section 2 — Wallet Connect (1:00–1:45)

**Steps:**
1. Click "Connect Wallet" in the top-right corner
2. MetaMask popup appears — approve connection
3. Show that the wallet address now appears in the header

**Say:**
> "Connecting a MetaMask wallet via window.ethereum gives us a live address.
> The rest of the UI is now personalized — open orders, LP positions, and order history
> will all filter to this wallet."

---

## Section 3 — Live Order Book (1:45–3:30)

**Steps:**
1. Point to the bid (green) and ask (red) tables
2. Note the best bid/ask and spread displayed above
3. Switch to the "Volume" tab — show the 1-minute stacked bar chart
4. Switch back to the "Price Chart" tab — point to TradingView-style candles

**Say:**
> "The order book auto-updates via Server-Sent Events — no polling.
> Bids are sorted highest price first; asks, lowest price first.
> Each row shows price, quantity, and cumulative depth.
> The volume chart aggregates buy and sell volume in 1-minute buckets over the last hour.
> The candlestick chart shows OHLCV data as the matching engine produces trades."

---

## Section 4 — Place a Limit Order (3:30–5:00)

**Steps:**
1. Click the "Trade" tab on the right panel
2. Select "Limit" order type, "Buy" side
3. Enter price: 2001.00, quantity: 0.5
4. Click "Place Order"
5. Watch the order book — the bid table updates

**Say:**
> "Placing a limit buy at 2001. The order goes to our off-chain CLOB matching engine,
> which runs price-time priority — best price first, FIFO within the same price level.
> You can see the order appear in the bid side of the book."

6. Click the "Orders" tab
7. Show the order in "Open Orders"

**Say:**
> "Switching to the Orders tab, we can see the order is live with status 'open'.
> If a counter-order crosses this price, the engine will fill it automatically."

---

## Section 5 — Order Fill & Trade Feed (5:00–5:45)

**Steps:**
1. From the Trade tab, place a market sell order at quantity 0.5 (this crosses the open bid)
2. Observe: the order book bid level disappears
3. Switch to Orders tab — original buy order now shows status "filled"

**Say:**
> "Placing a market sell at 0.5 ETH. The matching engine finds our open bid at 2001,
> matches them at the bid price, and the trade is executed.
> The open orders table updates immediately via the Socket.IO per-wallet room —
> the server pushes only this wallet's events, not the global broadcast."

---

## Section 6 — AMM Panel (5:45–7:30)

**Steps:**
1. Click the "AMM" tab
2. Show the LP Balance display — pool share, ETH/USDC value, IL%

**Say:**
> "The AMM section shows the active LP position for this wallet.
> Pool share, token values, entry price, and impermanent loss are all live."

3. Scroll to "Add Liquidity" section
4. Enter 0.1 ETH in the ETH field — USDC auto-fills based on pool ratio
5. Select 0.5% slippage
6. Click "Add Liquidity"

**Say:**
> "Adding liquidity: the USDC amount auto-fills from the current pool ratio —
> x·y=k means the ratio is fixed. Slippage tolerance protects against sandwich attacks.
> Pool share and LP tokens update after the transaction."

7. Scroll to "Remove Liquidity"
8. Click "50%" quick-select button

**Say:**
> "We can remove any percentage of the LP position. The preview shows how many
> ETH and USDC will be returned at current pool prices."

---

## Section 7 — Smart Contracts Overview (7:30–9:00)

**Switch to VS Code / terminal**

**Show:** `packages/contracts/contracts/`

**Say:**
> "On the smart contract side, we have six Solidity 0.8.24 contracts.
> OrderBook handles on-chain order placement with EIP-712 typed signatures
> and MEV protection via a commit-reveal scheme — you commit a hash of your order
> parameters, wait at least one block, then reveal. This prevents front-running.
> Settlement handles atomic ERC-20 transfers for matched trades.
> The matching engine calls settlement.settleMatch() automatically after each fill —
> the OrderBook contract holds an ISettlement interface reference and calls it
> inside a try-catch, so settlement failure never halts the matching flow."

**Show:** Struct definition in OrderBook.sol briefly

**Say:**
> "Order structs are gas-optimized via tight packing — trader address plus three
> one-byte enum fields fit in a single 32-byte storage slot, saving 3 SSTOREs
> per order placement."

---

## Section 8 — P2P Network (9:00–9:45)

**Switch to terminal**

**Show:** `packages/p2p-network/src/libp2p/node.ts`

**Say:**
> "The P2P layer uses LibP2P v3 with GossipSub for order propagation across peers.
> We added Kademlia DHT this sprint — nodes can announce themselves as providers
> for a specific trading pair and discover other peers with orders for that pair.
> This enables pair-partitioned order routing in a fully decentralized setup."

---

## Section 9 — Monitoring (9:45–10:30)

**Switch to browser: http://localhost:3003 (Grafana)**

**Show:** dex-dashboard (if Docker is running) or dashboard JSON in VS Code

**Say:**
> "The Grafana dashboard tracks orders per second, trade rate, HTTP latency at p50/p95/p99,
> trading volume in USD, and active WebSocket client count.
> All metrics come from Prometheus counters and histograms exposed at /metrics.
> We have k6 load tests targeting 1000 concurrent users — the thresholds are
> p95 latency under 500ms for writes and under 100ms for order book reads."

---

## Section 10 — Closing (10:30–11:00)

**Back to browser — DEX landing page**

**Say:**
> "To summarize: ZeTheta DEX is a full-stack decentralized exchange prototype with
> a TypeScript CLOB engine, six upgradeable smart contracts on Sepolia,
> a LibP2P P2P network with GossipSub and Kademlia DHT,
> a Fastify API with GraphQL and per-wallet Socket.IO rooms,
> a Next.js 14 frontend with real-time charts and AMM management,
> and a Prometheus + Grafana monitoring stack.
> Thank you."

---

## Post-recording checklist

- [ ] Trim silence at start/end
- [ ] Blur MetaMask seed phrase if it ever appears
- [ ] Save as `ZeTheta_DEX_Demo_v1.mp4`
- [ ] Store in internal Google Drive (NOT public platforms)
- [ ] Share link with @ZethetaIntern mentor only
