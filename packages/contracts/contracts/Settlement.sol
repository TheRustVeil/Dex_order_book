// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./TokenRegistry.sol";

/**
 * @title Settlement
 * @notice Escrow and atomic swap settlement for the ZeTheta DEX.
 *         Supports manual owner-triggered settlement and automatic on-match
 *         settlement triggered by the authorised OrderBook contract.
 */
contract Settlement is ReentrancyGuard, Ownable, Pausable {
    using SafeERC20 for IERC20;

    // ─── State ───────────────────────────────────────────────────────────────

    uint256 public constant FEE_DENOMINATOR = 10_000;

    TokenRegistry public registry;
    uint256 public feeBps;
    address public feeRecipient;
    address public authorizedOrderBook; // may call settleMatch()

    // trader → token → escrowed balance
    mapping(address => mapping(address => uint256)) public balances;

    // ─── Events ──────────────────────────────────────────────────────────────

    event Deposited(address indexed trader, address indexed token, uint256 amount);
    event Withdrawn(address indexed trader, address indexed token, uint256 amount);
    event FundsReleased(address indexed trader, address indexed token, uint256 amount);
    event Settled(
        address indexed buyer,
        address indexed seller,
        address indexed baseToken,
        address quoteToken,
        uint256 quantity,
        uint256 price,
        uint256 fee
    );
    event FeeUpdated(uint256 newFeeBps);
    event FeeRecipientUpdated(address newRecipient);
    event OrderBookAuthorized(address orderBook);

    // ─── Constructor ─────────────────────────────────────────────────────────

    /**
     * @param _feeRecipient Address that accumulates protocol fees (typically FeeManager)
     * @param _registry     TokenRegistry — needed to resolve pair token addresses for
     *                      auto-settlement. Pass address(0) if settleMatch() won't be used.
     */
    constructor(address _feeRecipient, address _registry) Ownable(msg.sender) {
        require(_feeRecipient != address(0), "Invalid feeRecipient");
        feeRecipient = _feeRecipient;
        registry     = TokenRegistry(_registry);
        feeBps       = 30; // 0.30%
    }

    // ─── Config ──────────────────────────────────────────────────────────────

    function setAuthorizedOrderBook(address _ob) external onlyOwner {
        authorizedOrderBook = _ob;
        emit OrderBookAuthorized(_ob);
    }

    function setFeeBps(uint256 _feeBps) external onlyOwner {
        require(_feeBps <= 100, "Max fee is 1%");
        feeBps = _feeBps;
        emit FeeUpdated(_feeBps);
    }

    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        require(_feeRecipient != address(0), "Invalid recipient");
        feeRecipient = _feeRecipient;
        emit FeeRecipientUpdated(_feeRecipient);
    }

    // ─── Escrow ──────────────────────────────────────────────────────────────

    function deposit(address token, uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "Amount must be > 0");
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        balances[msg.sender][token] += amount;
        emit Deposited(msg.sender, token, amount);
    }

    function withdraw(address token, uint256 amount) external nonReentrant whenNotPaused {
        require(balances[msg.sender][token] >= amount, "Insufficient balance");
        balances[msg.sender][token] -= amount;
        IERC20(token).safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, token, amount);
    }

    function releaseFunds(address trader, address token) external nonReentrant onlyOwner {
        uint256 amount = balances[trader][token];
        require(amount > 0, "Nothing to release");
        balances[trader][token] = 0;
        IERC20(token).safeTransfer(trader, amount);
        emit FundsReleased(trader, token, amount);
    }

    // ─── Settlement ──────────────────────────────────────────────────────────

    /**
     * @notice Manual settlement called by owner. Includes explicit slippage guards.
     */
    function settleTrade(
        address buyer,
        address seller,
        address baseToken,
        address quoteToken,
        uint256 quantity,
        uint256 price,
        uint256 minBaseOut,
        uint256 minQuoteOut
    ) external nonReentrant whenNotPaused onlyOwner {
        _settle(buyer, seller, baseToken, quoteToken, quantity, price, minBaseOut, minQuoteOut);
    }

    /**
     * @notice Auto-settlement hook called by the authorized OrderBook on each match.
     *         Resolves token addresses from the registry via pairId.
     */
    function settleMatch(
        address buyer,
        address seller,
        bytes32 pairId,
        uint256 price,
        uint256 quantity
    ) external nonReentrant whenNotPaused {
        require(
            msg.sender == owner() || msg.sender == authorizedOrderBook,
            "Unauthorized"
        );
        require(address(registry) != address(0), "Registry not set");
        (address baseToken, address quoteToken, bool active) = registry.pairs(pairId);
        require(active, "Pair not active");
        _settle(buyer, seller, baseToken, quoteToken, quantity, price, 0, 0);
    }

    // ─── Emergency controls ───────────────────────────────────────────────────

    function pause()   external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _settle(
        address buyer,
        address seller,
        address baseToken,
        address quoteToken,
        uint256 quantity,
        uint256 price,
        uint256 minBaseOut,
        uint256 minQuoteOut
    ) internal {
        uint256 quoteAmount    = (quantity * price) / 1e18;
        uint256 fee            = (quoteAmount * feeBps) / FEE_DENOMINATOR;
        uint256 sellerReceives = quoteAmount - fee;

        require(balances[buyer][quoteToken]  >= quoteAmount, "Buyer insufficient quote");
        require(balances[seller][baseToken]  >= quantity,    "Seller insufficient base");
        if (minBaseOut  > 0) require(quantity       >= minBaseOut,  "Slippage: base too low");
        if (minQuoteOut > 0) require(sellerReceives >= minQuoteOut, "Slippage: quote too low");

        balances[seller][baseToken]         -= quantity;
        balances[buyer][baseToken]          += quantity;
        balances[buyer][quoteToken]         -= quoteAmount;
        balances[seller][quoteToken]        += sellerReceives;
        balances[feeRecipient][quoteToken]  += fee;

        emit Settled(buyer, seller, baseToken, quoteToken, quantity, price, fee);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function getBalance(address trader, address token) external view returns (uint256) {
        return balances[trader][token];
    }
}
