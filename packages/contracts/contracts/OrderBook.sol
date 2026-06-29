// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./TokenRegistry.sol";
import "./interfaces/ISettlement.sol";

/**
 * @title OrderBook
 * @notice Central Limit Order Book with price-time priority matching.
 *         Features: EIP-712 off-chain signatures, MEV commit-reveal protection,
 *         gas-optimised struct packing, auto-settlement on match.
 */
contract OrderBook is ReentrancyGuard, Ownable, Pausable, EIP712 {
    using ECDSA for bytes32;

    // ─── Enums ────────────────────────────────────────────────────────────────

    enum OrderSide   { BUY, SELL }
    enum OrderType   { LIMIT, MARKET }
    enum OrderStatus { OPEN, FILLED, PARTIALLY_FILLED, CANCELLED }

    // ─── Gas-optimised struct ─────────────────────────────────────────────────
    // trader(20) + side(1) + orderType(1) + status(1) = 23 bytes packed into slot 0
    // Saves 3 SSTOREs per order vs spreading enums across separate 32-byte slots.

    struct Order {
        address     trader;      // 20 bytes |
        OrderSide   side;        //  1 byte  | slot 0 (23 of 32 bytes used)
        OrderType   orderType;   //  1 byte  |
        OrderStatus status;      //  1 byte  |
        bytes32     id;          // slot 1
        bytes32     pairId;      // slot 2
        uint256     price;       // slot 3 — 18-decimal quote units
        uint256     quantity;    // slot 4 — 18-decimal base units
        uint256     filled;      // slot 5
        uint256     timestamp;   // slot 6
        uint256     nonce;       // slot 7 — per-trader replay counter
        uint256     expiry;      // slot 8 — unix timestamp; 0 = no expiry
    }

    // ─── EIP-712 type hashes ─────────────────────────────────────────────────

    bytes32 private constant ORDER_TYPEHASH = keccak256(
        "Order(address trader,bytes32 pairId,uint8 side,uint8 orderType,uint256 price,uint256 quantity,uint256 nonce,uint256 expiry)"
    );
    bytes32 private constant CANCEL_TYPEHASH = keccak256(
        "CancelOrder(bytes32 orderId,uint256 nonce,uint256 deadline)"
    );

    // ─── State ───────────────────────────────────────────────────────────────

    TokenRegistry public immutable registry;
    ISettlement   public settlement; // optional — auto-settle matched trades

    mapping(bytes32 => Order)     public orders;
    mapping(bytes32 => bytes32[]) public bidOrderIds;  // pairId → sorted desc price
    mapping(bytes32 => bytes32[]) public askOrderIds;  // pairId → sorted asc price
    mapping(address => bytes32[]) public traderOrders;
    mapping(address => uint256)   public nonces;

    // MEV commit-reveal
    mapping(address => bytes32) public orderCommitments;
    mapping(address => uint256) public commitBlock;
    uint256 public minCommitBlocks; // blocks a commitment must age before reveal

    uint256 private _orderNonce;

    // ─── Events ──────────────────────────────────────────────────────────────

    event OrderPlaced(
        bytes32 indexed orderId,
        address indexed trader,
        bytes32 indexed pairId,
        OrderSide side,
        uint256 price,
        uint256 quantity
    );
    event OrderFilled(bytes32 indexed orderId, uint256 filledQty, uint256 price);
    event OrderCancelled(bytes32 indexed orderId);
    event TradeExecuted(
        bytes32 indexed buyOrderId,
        bytes32 indexed sellOrderId,
        uint256 price,
        uint256 quantity
    );
    event OrderCommitted(address indexed trader, bytes32 commitment);
    event SettlementUpdated(address settlement);

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor(address _registry)
        Ownable(msg.sender)
        EIP712("ZeTheta OrderBook", "1")
    {
        registry        = TokenRegistry(_registry);
        minCommitBlocks = 1;
    }

    // ─── Config ──────────────────────────────────────────────────────────────

    function setSettlement(address _settlement) external onlyOwner {
        settlement = ISettlement(_settlement);
        emit SettlementUpdated(_settlement);
    }

    function setMinCommitBlocks(uint256 n) external onlyOwner {
        minCommitBlocks = n;
    }

    // ─── Emergency controls ───────────────────────────────────────────────────

    function pause()   external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ─── MEV Commit-Reveal ────────────────────────────────────────────────────

    /**
     * @notice Step 1 — commit a hash of your intended order params.
     *         Hides the order from mempool bots until reveal.
     * @param commitment keccak256(abi.encode(pairId, side, orderType, price, quantity, expiry, salt))
     */
    function commitOrder(bytes32 commitment) external {
        orderCommitments[msg.sender] = commitment;
        commitBlock[msg.sender]      = block.number;
        emit OrderCommitted(msg.sender, commitment);
    }

    /**
     * @notice Step 2 — reveal the order committed in commitOrder().
     *         Must be called at least minCommitBlocks after commit.
     */
    function revealOrder(
        bytes32   pairId,
        OrderSide side,
        OrderType orderType,
        uint256   price,
        uint256   quantity,
        uint256   expiry,
        bytes32   salt
    ) external nonReentrant whenNotPaused returns (bytes32 orderId) {
        bytes32 expected = keccak256(
            abi.encode(pairId, side, orderType, price, quantity, expiry, salt)
        );
        require(orderCommitments[msg.sender] == expected, "Commitment mismatch");
        require(block.number >= commitBlock[msg.sender] + minCommitBlocks, "Commit too recent");

        delete orderCommitments[msg.sender];
        delete commitBlock[msg.sender];
        orderId = _createOrder(msg.sender, pairId, side, orderType, price, quantity, expiry);
    }

    // ─── Direct order placement ───────────────────────────────────────────────

    function placeOrder(
        bytes32   pairId,
        OrderSide side,
        OrderType orderType,
        uint256   price,
        uint256   quantity,
        uint256   expiry
    ) external nonReentrant whenNotPaused returns (bytes32 orderId) {
        orderId = _createOrder(msg.sender, pairId, side, orderType, price, quantity, expiry);
    }

    // ─── EIP-712 gasless relayer path ─────────────────────────────────────────

    function placeOrderBySig(
        address   trader,
        bytes32   pairId,
        OrderSide side,
        OrderType orderType,
        uint256   price,
        uint256   quantity,
        uint256   expiry,
        bytes calldata signature
    ) external nonReentrant whenNotPaused returns (bytes32 orderId) {
        uint256 traderNonce = nonces[trader];
        bytes32 structHash = keccak256(abi.encode(
            ORDER_TYPEHASH, trader, pairId, uint8(side), uint8(orderType),
            price, quantity, traderNonce, expiry
        ));
        address signer = _hashTypedDataV4(structHash).recover(signature);
        require(signer == trader,                          "Invalid signature");
        require(expiry == 0 || block.timestamp <= expiry, "Order expired");

        nonces[trader]++;
        orderId = _createOrder(trader, pairId, side, orderType, price, quantity, expiry);
    }

    // ─── Cancel ───────────────────────────────────────────────────────────────

    function cancelOrder(bytes32 orderId) external nonReentrant {
        Order storage order = orders[orderId];
        require(order.trader == msg.sender, "Not order owner");
        require(
            order.status == OrderStatus.OPEN || order.status == OrderStatus.PARTIALLY_FILLED,
            "Not cancellable"
        );
        order.status = OrderStatus.CANCELLED;
        emit OrderCancelled(orderId);
    }

    function cancelOrderBySig(
        bytes32 orderId,
        uint256 deadline,
        bytes calldata signature
    ) external nonReentrant {
        require(block.timestamp <= deadline, "Signature expired");
        Order storage order = orders[orderId];
        require(
            order.status == OrderStatus.OPEN || order.status == OrderStatus.PARTIALLY_FILLED,
            "Not cancellable"
        );

        uint256 traderNonce = nonces[order.trader];
        bytes32 structHash  = keccak256(abi.encode(CANCEL_TYPEHASH, orderId, traderNonce, deadline));
        address signer      = _hashTypedDataV4(structHash).recover(signature);
        require(signer == order.trader, "Invalid signature");

        nonces[order.trader]++;
        order.status = OrderStatus.CANCELLED;
        emit OrderCancelled(orderId);
    }

    // ─── External match trigger ───────────────────────────────────────────────

    function matchOrder(bytes32 pairId) external nonReentrant whenNotPaused {
        _tryMatch(pairId);
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _createOrder(
        address   trader,
        bytes32   pairId,
        OrderSide side,
        OrderType orderType,
        uint256   price,
        uint256   quantity,
        uint256   expiry
    ) internal returns (bytes32 orderId) {
        require(registry.isPairActive(pairId),             "Pair not active");
        require(quantity > 0,                              "Quantity must be > 0");
        if (orderType == OrderType.LIMIT) require(price > 0, "Price must be > 0");
        require(expiry == 0 || expiry > block.timestamp,   "Expiry in the past");

        orderId = keccak256(abi.encodePacked(trader, pairId, ++_orderNonce, block.timestamp));

        orders[orderId] = Order({
            trader:    trader,
            side:      side,
            orderType: orderType,
            status:    OrderStatus.OPEN,
            id:        orderId,
            pairId:    pairId,
            price:     price,
            quantity:  quantity,
            filled:    0,
            timestamp: block.timestamp,
            nonce:     nonces[trader],
            expiry:    expiry
        });

        traderOrders[trader].push(orderId);

        if (side == OrderSide.BUY) {
            _insertBid(pairId, orderId, price);
        } else {
            _insertAsk(pairId, orderId, price);
        }

        emit OrderPlaced(orderId, trader, pairId, side, price, quantity);
        _tryMatch(pairId);
    }

    function _tryMatch(bytes32 pairId) internal {
        bytes32[] storage bids = bidOrderIds[pairId];
        bytes32[] storage asks = askOrderIds[pairId];

        while (bids.length > 0 && asks.length > 0) {
            bytes32 bestBidId = bids[0];
            bytes32 bestAskId = asks[0];
            Order storage bid = orders[bestBidId];
            Order storage ask = orders[bestAskId];

            if (_isInactive(bid) || _isExpired(bid)) { _removeFirst(bids); continue; }
            if (_isInactive(ask) || _isExpired(ask)) { _removeFirst(asks); continue; }

            if (bid.price < ask.price) break;

            uint256 matchPrice = ask.price;
            uint256 bidRem     = bid.quantity - bid.filled;
            uint256 askRem     = ask.quantity - ask.filled;
            uint256 matchQty   = bidRem < askRem ? bidRem : askRem;

            bid.filled += matchQty;
            ask.filled += matchQty;

            bid.status = bid.filled == bid.quantity ? OrderStatus.FILLED : OrderStatus.PARTIALLY_FILLED;
            ask.status = ask.filled == ask.quantity ? OrderStatus.FILLED : OrderStatus.PARTIALLY_FILLED;

            emit TradeExecuted(bestBidId, bestAskId, matchPrice, matchQty);
            emit OrderFilled(bestBidId, matchQty, matchPrice);
            emit OrderFilled(bestAskId, matchQty, matchPrice);

            // Auto-trigger settlement; swallow errors so a failed escrow never halts matching
            if (address(settlement) != address(0)) {
                try settlement.settleMatch(bid.trader, ask.trader, pairId, matchPrice, matchQty) {}
                catch {}
            }

            if (bid.status == OrderStatus.FILLED) _removeFirst(bids);
            if (ask.status == OrderStatus.FILLED) _removeFirst(asks);
        }
    }

    function _isInactive(Order storage o) internal view returns (bool) {
        return o.status == OrderStatus.FILLED || o.status == OrderStatus.CANCELLED;
    }

    function _isExpired(Order storage o) internal view returns (bool) {
        return o.expiry != 0 && block.timestamp > o.expiry;
    }

    function _insertBid(bytes32 pairId, bytes32 orderId, uint256 price) internal {
        bytes32[] storage arr = bidOrderIds[pairId];
        arr.push(orderId);
        uint256 i = arr.length - 1;
        while (i > 0 && orders[arr[i]].price > orders[arr[i - 1]].price) {
            (arr[i], arr[i - 1]) = (arr[i - 1], arr[i]);
            i--;
        }
    }

    function _insertAsk(bytes32 pairId, bytes32 orderId, uint256 price) internal {
        bytes32[] storage arr = askOrderIds[pairId];
        arr.push(orderId);
        uint256 i = arr.length - 1;
        while (i > 0 && orders[arr[i]].price < orders[arr[i - 1]].price) {
            (arr[i], arr[i - 1]) = (arr[i - 1], arr[i]);
            i--;
        }
    }

    function _removeFirst(bytes32[] storage arr) internal {
        for (uint256 i = 0; i < arr.length - 1; i++) arr[i] = arr[i + 1];
        arr.pop();
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function getBestBid(bytes32 pairId) external view returns (uint256 price, uint256 quantity) {
        bytes32[] storage bids = bidOrderIds[pairId];
        for (uint256 i = 0; i < bids.length; i++) {
            Order storage o = orders[bids[i]];
            if (!_isInactive(o) && !_isExpired(o)) return (o.price, o.quantity - o.filled);
        }
    }

    function getBestAsk(bytes32 pairId) external view returns (uint256 price, uint256 quantity) {
        bytes32[] storage asks = askOrderIds[pairId];
        for (uint256 i = 0; i < asks.length; i++) {
            Order storage o = orders[asks[i]];
            if (!_isInactive(o) && !_isExpired(o)) return (o.price, o.quantity - o.filled);
        }
    }

    function getTraderOrders(address trader) external view returns (bytes32[] memory) {
        return traderOrders[trader];
    }

    function getOrder(bytes32 orderId) external view returns (Order memory) {
        return orders[orderId];
    }

    function getDomainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
}
