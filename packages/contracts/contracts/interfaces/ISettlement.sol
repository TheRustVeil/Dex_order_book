// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ISettlement {
    /**
     * @notice Called by OrderBook after a successful match to atomically settle tokens.
     * @param buyer    Address of the buy-order trader
     * @param seller   Address of the sell-order trader
     * @param pairId   The trading pair bytes32 id
     * @param price    Matched price (18-decimal quote units)
     * @param quantity Matched quantity (18-decimal base units)
     */
    function settleMatch(
        address buyer,
        address seller,
        bytes32 pairId,
        uint256 price,
        uint256 quantity
    ) external;
}
