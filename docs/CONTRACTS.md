# Smart Contracts Reference

> CONFIDENTIAL — ZeTheta Algorithms Private Limited

## Overview

Three Solidity contracts handle on-chain order management and settlement on Ethereum (Sepolia testnet).

## Contracts

### TokenRegistry.sol

Maintains a whitelist of approved ERC-20 tokens and valid trading pairs.

**Key functions:**

| Function | Access | Description |
|---|---|---|
| `registerToken(address, string, uint8)` | Owner | Whitelist a new ERC-20 token |
| `registerPair(address base, address quote)` | Owner | Create a trading pair |
| `isTokenActive(address)` | Public | Check if token is whitelisted |
| `isPairActive(bytes32)` | Public | Check if pair is active |
| `getPairId(address base, address quote)` | Public | Compute pair identifier |

**Events:**
- `TokenRegistered(address token, string symbol, uint8 decimals)`
- `PairRegistered(bytes32 pairId, address baseToken, address quoteToken)`

---

### OrderBook.sol

On-chain CLOB. Stores open orders and executes price-time priority matching.

**Key functions:**

| Function | Access | Description |
|---|---|---|
| `placeOrder(pairId, side, type, price, qty)` | Public | Place a new limit or market order |
| `cancelOrder(bytes32 orderId)` | Order owner | Cancel an open order |
| `getBestBid(bytes32 pairId)` | Public view | Get best bid price and quantity |
| `getBestAsk(bytes32 pairId)` | Public view | Get best ask price and quantity |
| `getOrder(bytes32 orderId)` | Public view | Get order details |
| `getTraderOrders(address)` | Public view | List all orders for a trader |

**Order struct:**
```solidity
struct Order {
    bytes32 id;
    address trader;
    bytes32 pairId;
    OrderSide side;       // BUY | SELL
    OrderType orderType;  // LIMIT | MARKET
    uint256 price;        // quote token units (18 decimals)
    uint256 quantity;     // base token units (18 decimals)
    uint256 filled;       // amount matched so far
    OrderStatus status;   // OPEN | FILLED | PARTIALLY_FILLED | CANCELLED
    uint256 timestamp;
}
```

**Events:**
- `OrderPlaced(orderId, trader, pairId, side, price, quantity)`
- `TradeExecuted(buyOrderId, sellOrderId, price, quantity)`
- `OrderCancelled(orderId)`

**Matching algorithm:**
1. New order inserted into sorted array (bid descending, ask ascending)
2. `_tryMatch()` called: loops while best bid price ≥ best ask price
3. Match quantity = `min(bidRemaining, askRemaining)`
4. Orders updated, `TradeExecuted` emitted, exhausted orders removed

---

### Settlement.sol

Atomic ERC-20 balance management and trade settlement with fee deduction.

**Key functions:**

| Function | Access | Description |
|---|---|---|
| `deposit(token, amount)` | Public | Deposit ERC-20 tokens into escrow |
| `withdraw(token, amount)` | Public | Withdraw tokens from escrow |
| `settle(buyer, seller, base, quote, qty, price)` | Owner (OrderBook) | Atomic settlement of a matched trade |
| `setFeeBps(uint256)` | Owner | Update protocol fee (max 100 bps = 1%) |
| `getBalance(trader, token)` | Public view | Check trader's deposited balance |

**Fee model:**
- Default: 30 bps (0.30%) on quote token
- Fee sent to `feeRecipient` (protocol treasury)
- Formula: `fee = (quoteAmount * feeBps) / 10_000`

**Events:**
- `Deposited(trader, token, amount)`
- `Withdrawn(trader, token, amount)`
- `Settled(buyer, seller, baseToken, quoteToken, quantity, price, fee)`

---

## Deployment

### Local (Hardhat)

```bash
cd packages/contracts
pnpm install
pnpm deploy:local
```

### Sepolia Testnet

```bash
# Set PRIVATE_KEY and SEPOLIA_RPC_URL in .env
pnpm deploy:sepolia
```

Deployed addresses should be added to `.env`:
```
NEXT_PUBLIC_ORDERBOOK_CONTRACT=0x...
NEXT_PUBLIC_SETTLEMENT_CONTRACT=0x...
NEXT_PUBLIC_TOKEN_REGISTRY_CONTRACT=0x...
```

### Verification

```bash
pnpm hardhat verify --network sepolia <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>
```

---

## Security Considerations

- All state-changing functions use `ReentrancyGuard`
- `SafeERC20` used for all token transfers to handle non-standard ERC-20s
- On-chain matching is O(n) in book depth — designed for moderate order counts
- Production: off-chain matcher + on-chain settlement is the recommended pattern
