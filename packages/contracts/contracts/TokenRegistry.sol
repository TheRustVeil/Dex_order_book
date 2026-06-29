// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title TokenRegistry
 * @notice Whitelist of ERC20 tokens and trading pairs for the ZeTheta DEX.
 */
contract TokenRegistry is Ownable {

    struct TokenInfo {
        string symbol;
        uint8  decimals;
        bool   active;
    }

    struct TradingPair {
        address baseToken;
        address quoteToken;
        bool    active;
    }

    mapping(address => TokenInfo)   public tokens;
    mapping(bytes32 => TradingPair) public pairs;
    address[] public tokenList;
    bytes32[] public pairList;

    // ─── Events ──────────────────────────────────────────────────────────────

    event TokenAdded(address indexed token, string symbol, uint8 decimals);
    event TokenRemoved(address indexed token);
    event PairCreated(bytes32 indexed pairId, address baseToken, address quoteToken);
    event PairDeactivated(bytes32 indexed pairId);

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor() Ownable(msg.sender) {}

    // ─── Token management ────────────────────────────────────────────────────

    function addToken(
        address token,
        string calldata symbol,
        uint8  decimals
    ) external onlyOwner {
        require(token != address(0),   "Invalid address");
        require(!tokens[token].active, "Already registered");
        tokens[token] = TokenInfo({ symbol: symbol, decimals: decimals, active: true });
        tokenList.push(token);
        emit TokenAdded(token, symbol, decimals);
    }

    function removeToken(address token) external onlyOwner {
        require(tokens[token].active, "Token not active");
        tokens[token].active = false;
        emit TokenRemoved(token);
    }

    // ─── Pair management ─────────────────────────────────────────────────────

    function createPair(address baseToken, address quoteToken) external onlyOwner returns (bytes32 pairId) {
        require(tokens[baseToken].active,  "Base token not registered");
        require(tokens[quoteToken].active, "Quote token not registered");
        pairId = keccak256(abi.encodePacked(baseToken, quoteToken));
        require(!pairs[pairId].active, "Pair already exists");
        pairs[pairId] = TradingPair({ baseToken: baseToken, quoteToken: quoteToken, active: true });
        pairList.push(pairId);
        emit PairCreated(pairId, baseToken, quoteToken);
    }

    function deactivatePair(bytes32 pairId) external onlyOwner {
        require(pairs[pairId].active, "Pair not active");
        pairs[pairId].active = false;
        emit PairDeactivated(pairId);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function isTokenActive(address token)  external view returns (bool) { return tokens[token].active; }
    function isPairActive(bytes32 pairId)  external view returns (bool) { return pairs[pairId].active; }

    function getPairId(address baseToken, address quoteToken) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(baseToken, quoteToken));
    }

    function getTokenCount() external view returns (uint256) { return tokenList.length; }
    function getPairCount()  external view returns (uint256) { return pairList.length; }
}
