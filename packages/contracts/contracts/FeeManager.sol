// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./Settlement.sol";

/**
 * @title FeeManager
 * @notice Collects accumulated fees from Settlement and distributes them
 *         between the protocol treasury and the LP reward pool.
 *
 *         FeeManager is set as Settlement's feeRecipient. Protocol fees accrue
 *         in Settlement under address(this). Call collectFees() to pull them out,
 *         then distributeFees() to split them. Or use collectAndDistribute() in one tx.
 */
contract FeeManager is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── State ───────────────────────────────────────────────────────────────

    uint256 public constant DENOMINATOR = 10_000;

    Settlement public settlement;
    address    public treasury;          // protocol wallet
    address    public lpRewardPool;      // LP rewards distributor

    uint256 public treasuryShareBps;     // treasury's cut out of 10_000 (default 50%)

    mapping(address => uint256) public totalCollected;
    mapping(address => uint256) public totalDistributed;

    // ─── Events ──────────────────────────────────────────────────────────────

    event FeesCollected(address indexed token, uint256 amount);
    event FeesDistributed(address indexed token, uint256 toTreasury, uint256 toLPs);
    event TreasuryUpdated(address newTreasury);
    event LPRewardPoolUpdated(address newLPRewardPool);
    event SplitUpdated(uint256 newTreasuryShareBps);

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor(
        address _settlement,
        address _treasury,
        address _lpRewardPool
    ) Ownable(msg.sender) {
        require(_settlement   != address(0), "Invalid settlement");
        require(_treasury     != address(0), "Invalid treasury");
        require(_lpRewardPool != address(0), "Invalid LP reward pool");
        settlement       = Settlement(_settlement);
        treasury         = _treasury;
        lpRewardPool     = _lpRewardPool;
        treasuryShareBps = 5_000; // 50% to treasury, 50% to LPs
    }

    // ─── Collect ─────────────────────────────────────────────────────────────

    function collectFees(address token) external nonReentrant returns (uint256 amount) {
        amount = settlement.getBalance(address(this), token);
        require(amount > 0, "No fees to collect");

        settlement.withdraw(token, amount);

        totalCollected[token] += amount;
        emit FeesCollected(token, amount);
    }

    // ─── Distribute ──────────────────────────────────────────────────────────

    function distributeFees(address token) external nonReentrant onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, "Nothing to distribute");

        uint256 toTreasury = (balance * treasuryShareBps) / DENOMINATOR;
        uint256 toLPs      = balance - toTreasury;

        if (toTreasury > 0) IERC20(token).safeTransfer(treasury,     toTreasury);
        if (toLPs      > 0) IERC20(token).safeTransfer(lpRewardPool, toLPs);

        totalDistributed[token] += balance;
        emit FeesDistributed(token, toTreasury, toLPs);
    }

    function collectAndDistribute(address token) external nonReentrant onlyOwner {
        uint256 amount = settlement.getBalance(address(this), token);
        if (amount > 0) {
            settlement.withdraw(token, amount);
            totalCollected[token] += amount;
            emit FeesCollected(token, amount);
        }

        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, "Nothing to distribute");

        uint256 toTreasury = (balance * treasuryShareBps) / DENOMINATOR;
        uint256 toLPs      = balance - toTreasury;

        if (toTreasury > 0) IERC20(token).safeTransfer(treasury,     toTreasury);
        if (toLPs      > 0) IERC20(token).safeTransfer(lpRewardPool, toLPs);

        totalDistributed[token] += balance;
        emit FeesDistributed(token, toTreasury, toLPs);
    }

    // ─── Config ──────────────────────────────────────────────────────────────

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid address");
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    function setLPRewardPool(address _lpRewardPool) external onlyOwner {
        require(_lpRewardPool != address(0), "Invalid address");
        lpRewardPool = _lpRewardPool;
        emit LPRewardPoolUpdated(_lpRewardPool);
    }

    function setTreasuryShareBps(uint256 _bps) external onlyOwner {
        require(_bps <= DENOMINATOR, "Cannot exceed 100%");
        treasuryShareBps = _bps;
        emit SplitUpdated(_bps);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function pendingFees(address token) external view returns (uint256) {
        return settlement.getBalance(address(this), token);
    }
}
