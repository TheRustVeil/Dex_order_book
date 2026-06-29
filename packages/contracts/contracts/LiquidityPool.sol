// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title LiquidityPool
 * @notice Constant-product AMM (x * y = k) with 0.30% swap fee.
 *         This contract IS the LP token (ERC20). Add liquidity to receive
 *         LP tokens representing your share. Burn them to withdraw proportionally.
 */
contract LiquidityPool is ERC20, ReentrancyGuard, Ownable, Pausable {
    using SafeERC20 for IERC20;

    // ─── Constants ───────────────────────────────────────────────────────────

    uint256 public constant FEE_BPS           = 30;
    uint256 public constant FEE_DENOMINATOR   = 10_000;
    uint256 public constant MINIMUM_LIQUIDITY = 1_000; // permanently locked on first deposit

    // ─── State ───────────────────────────────────────────────────────────────

    address public tokenA;
    address public tokenB;
    uint256 public reserveA;
    uint256 public reserveB;

    // Snapshot of pool price at the time each provider added liquidity (for IL calc)
    mapping(address => uint256) public entryPriceAperB; // (reserveB/reserveA) * 1e18

    // ─── Events ──────────────────────────────────────────────────────────────

    event LiquidityAdded(address indexed provider, uint256 amountA, uint256 amountB, uint256 lpMinted);
    event LiquidityRemoved(address indexed provider, uint256 amountA, uint256 amountB, uint256 lpBurned);
    event Swapped(address indexed trader, address indexed tokenIn, uint256 amountIn, address indexed tokenOut, uint256 amountOut);
    event ReservesUpdated(uint256 reserveA, uint256 reserveB);

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor(address _tokenA, address _tokenB)
        ERC20("ZeTheta LP Token", "ZLP")
        Ownable(msg.sender)
    {
        require(_tokenA != address(0) && _tokenB != address(0), "Invalid token");
        require(_tokenA != _tokenB, "Identical tokens");
        tokenA = _tokenA;
        tokenB = _tokenB;
    }

    // ─── Add Liquidity ───────────────────────────────────────────────────────

    function addLiquidity(
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin
    ) external nonReentrant whenNotPaused returns (uint256 amountA, uint256 amountB, uint256 lpMinted) {
        require(amountADesired > 0 && amountBDesired > 0, "Amounts must be > 0");

        if (reserveA == 0 && reserveB == 0) {
            amountA = amountADesired;
            amountB = amountBDesired;
        } else {
            uint256 amountBOptimal = (amountADesired * reserveB) / reserveA;
            if (amountBOptimal <= amountBDesired) {
                require(amountBOptimal >= amountBMin, "Slippage: insufficient B");
                amountA = amountADesired;
                amountB = amountBOptimal;
            } else {
                uint256 amountAOptimal = (amountBDesired * reserveA) / reserveB;
                require(amountAOptimal >= amountAMin, "Slippage: insufficient A");
                amountA = amountAOptimal;
                amountB = amountBDesired;
            }
        }

        IERC20(tokenA).safeTransferFrom(msg.sender, address(this), amountA);
        IERC20(tokenB).safeTransferFrom(msg.sender, address(this), amountB);

        uint256 supply = totalSupply();
        if (supply == 0) {
            lpMinted = _sqrt(amountA * amountB) - MINIMUM_LIQUIDITY;
            _mint(address(1), MINIMUM_LIQUIDITY); // lock minimum permanently
        } else {
            uint256 lpFromA = (amountA * supply) / reserveA;
            uint256 lpFromB = (amountB * supply) / reserveB;
            lpMinted = lpFromA < lpFromB ? lpFromA : lpFromB;
        }

        require(lpMinted > 0, "Insufficient liquidity minted");

        entryPriceAperB[msg.sender] = (reserveB + amountB) * 1e18 / (reserveA + amountA);

        _mint(msg.sender, lpMinted);
        _updateReserves(reserveA + amountA, reserveB + amountB);

        emit LiquidityAdded(msg.sender, amountA, amountB, lpMinted);
    }

    // ─── Remove Liquidity ────────────────────────────────────────────────────

    function removeLiquidity(
        uint256 lpAmount,
        uint256 amountAMin,
        uint256 amountBMin
    ) external nonReentrant whenNotPaused returns (uint256 amountA, uint256 amountB) {
        require(lpAmount > 0, "lpAmount must be > 0");
        require(balanceOf(msg.sender) >= lpAmount, "Insufficient LP balance");

        uint256 supply = totalSupply();
        amountA = (lpAmount * reserveA) / supply;
        amountB = (lpAmount * reserveB) / supply;

        require(amountA >= amountAMin, "Slippage: insufficient A");
        require(amountB >= amountBMin, "Slippage: insufficient B");
        require(amountA > 0 && amountB > 0, "Insufficient liquidity burned");

        _burn(msg.sender, lpAmount);
        _updateReserves(reserveA - amountA, reserveB - amountB);

        IERC20(tokenA).safeTransfer(msg.sender, amountA);
        IERC20(tokenB).safeTransfer(msg.sender, amountB);

        emit LiquidityRemoved(msg.sender, amountA, amountB, lpAmount);
    }

    // ─── Swap ────────────────────────────────────────────────────────────────

    function swap(
        address _tokenIn,
        uint256 amountIn,
        uint256 amountOutMin
    ) external nonReentrant whenNotPaused returns (uint256 amountOut) {
        require(_tokenIn == tokenA || _tokenIn == tokenB, "Invalid tokenIn");
        require(amountIn > 0, "amountIn must be > 0");

        bool aToB = _tokenIn == tokenA;
        (uint256 reserveIn, uint256 reserveOut) = aToB ? (reserveA, reserveB) : (reserveB, reserveA);

        amountOut = getAmountOut(amountIn, reserveIn, reserveOut);
        require(amountOut >= amountOutMin, "Slippage: amountOut too low");
        require(amountOut < reserveOut,    "Insufficient pool liquidity");

        address _tokenOut = aToB ? tokenB : tokenA;

        IERC20(_tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(_tokenOut).safeTransfer(msg.sender, amountOut);

        if (aToB) {
            _updateReserves(reserveA + amountIn, reserveB - amountOut);
        } else {
            _updateReserves(reserveA - amountOut, reserveB + amountIn);
        }

        emit Swapped(msg.sender, _tokenIn, amountIn, _tokenOut, amountOut);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function getPrice(bool aToBDirection) external view returns (uint256 price) {
        require(reserveA > 0 && reserveB > 0, "Pool is empty");
        price = aToBDirection
            ? (reserveB * 1e18) / reserveA
            : (reserveA * 1e18) / reserveB;
    }

    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) public pure returns (uint256 amountOut) {
        require(amountIn > 0,                        "amountIn must be > 0");
        require(reserveIn > 0 && reserveOut > 0,     "Empty reserves");
        uint256 amountInWithFee = amountIn * (FEE_DENOMINATOR - FEE_BPS);
        amountOut = (reserveOut * amountInWithFee) / (reserveIn * FEE_DENOMINATOR + amountInWithFee);
    }

    function getAmountIn(
        uint256 amountOut,
        uint256 reserveIn,
        uint256 reserveOut
    ) public pure returns (uint256 amountIn) {
        require(amountOut > 0,          "amountOut must be > 0");
        require(amountOut < reserveOut, "Insufficient liquidity");
        amountIn = (reserveIn * amountOut * FEE_DENOMINATOR) /
                   ((reserveOut - amountOut) * (FEE_DENOMINATOR - FEE_BPS)) + 1;
    }

    /**
     * @notice Impermanent loss for a provider vs just holding.
     *         IL = 2*sqrt(r)/(1+r) - 1 where r = currentPrice / entryPrice
     * @return ilScaled Negative value scaled 1e18. E.g. -50000000000000000 = -5% IL.
     */
    function getImpermanentLoss(address provider) external view returns (int256 ilScaled) {
        uint256 entry = entryPriceAperB[provider];
        require(entry > 0,    "No recorded entry price");
        require(reserveA > 0, "Pool is empty");

        uint256 current = (reserveB * 1e18) / reserveA;
        uint256 r       = (current * 1e18) / entry;   // price ratio, 1e18-scaled

        uint256 sqrtR_1e9  = _sqrt(r);
        uint256 numerator   = 2 * sqrtR_1e9 * 1e9;  // 2*sqrt(r) in 1e18
        uint256 denominator = 1e18 + r;              // (1+r) in 1e18
        uint256 ratio       = (numerator * 1e18) / denominator;
        ilScaled = int256(ratio) - int256(1e18);
    }

    function getReserves() external view returns (uint256 _reserveA, uint256 _reserveB) {
        return (reserveA, reserveB);
    }

    // ─── Emergency controls ───────────────────────────────────────────────────

    function pause()   external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _updateReserves(uint256 _reserveA, uint256 _reserveB) internal {
        reserveA = _reserveA;
        reserveB = _reserveB;
        emit ReservesUpdated(_reserveA, _reserveB);
    }

    function _sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) { z = x; x = (y / x + x) / 2; }
        } else if (y != 0) {
            z = 1;
        }
    }
}
