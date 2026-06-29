// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./LiquidityPool.sol";
import "./TokenRegistry.sol";

/**
 * @title Factory
 * @notice Deploys and tracks LiquidityPool contracts for each token pair.
 *         Tokens are sorted so createPair(A,B) == createPair(B,A).
 */
contract Factory is Ownable {

    // ─── State ───────────────────────────────────────────────────────────────

    TokenRegistry public registry;

    // sorted(tokenA, tokenB) → pool address
    mapping(address => mapping(address => address)) private _pairs;

    address[] public allPairs;

    // ─── Events ──────────────────────────────────────────────────────────────

    event PairCreated(address indexed tokenA, address indexed tokenB, address pool, uint256 totalPairs);

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor(address _registry) Ownable(msg.sender) {
        require(_registry != address(0), "Invalid registry");
        registry = TokenRegistry(_registry);
    }

    // ─── Pair creation ───────────────────────────────────────────────────────

    /**
     * @notice Deploy a new LiquidityPool for the tokenA/tokenB pair.
     *         Both tokens must already be whitelisted in TokenRegistry.
     */
    function createPair(address tokenA, address tokenB) external onlyOwner returns (address pool) {
        require(tokenA != tokenB,                                  "Identical tokens");
        require(tokenA != address(0) && tokenB != address(0),      "Zero address");
        require(registry.isTokenActive(tokenA),                    "TokenA not registered");
        require(registry.isTokenActive(tokenB),                    "TokenB not registered");

        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(_pairs[token0][token1] == address(0),              "Pair already exists");

        pool = address(new LiquidityPool(token0, token1));

        _pairs[token0][token1] = pool;
        allPairs.push(pool);

        emit PairCreated(token0, token1, pool, allPairs.length);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function getPair(address tokenA, address tokenB) external view returns (address pool) {
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        pool = _pairs[token0][token1];
    }

    function allPairsLength() external view returns (uint256) {
        return allPairs.length;
    }
}
