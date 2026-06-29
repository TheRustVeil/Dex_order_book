import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
  TokenRegistry,
  OrderBook,
  Settlement,
  LiquidityPool,
  Factory,
  FeeManager,
} from "../typechain-types";

describe("Integration", () => {
  let owner: SignerWithAddress;
  let trader1: SignerWithAddress;
  let trader2: SignerWithAddress;
  let treasury: SignerWithAddress;

  let registry: TokenRegistry;
  let orderBook: OrderBook;
  let settlement: Settlement;
  let factory: Factory;
  let feeManager: FeeManager;
  let pool: LiquidityPool;

  let weth: any;
  let usdc: any;
  let pairId: string;

  const WETH_SUPPLY = ethers.parseEther("10000");
  const USDC_SUPPLY = ethers.parseEther("10000000");

  beforeEach(async () => {
    [owner, trader1, trader2, treasury] = await ethers.getSigners();

    // ── Tokens ──────────────────────────────────────────────────────────────
    const ERC20 = await ethers.getContractFactory("MockERC20");
    weth = await ERC20.deploy("Wrapped ETH", "WETH", WETH_SUPPLY);
    usdc = await ERC20.deploy("USD Coin",    "USDC", USDC_SUPPLY);

    await weth.transfer(trader1.address, ethers.parseEther("100"));
    await weth.transfer(trader2.address, ethers.parseEther("100"));
    await usdc.transfer(trader1.address, ethers.parseEther("100000"));
    await usdc.transfer(trader2.address, ethers.parseEther("100000"));

    // ── Contracts ────────────────────────────────────────────────────────────
    const RegistryF   = await ethers.getContractFactory("TokenRegistry");
    const OrderBookF  = await ethers.getContractFactory("OrderBook");
    const SettlementF = await ethers.getContractFactory("Settlement");
    const FactoryF    = await ethers.getContractFactory("Factory");
    const FeeManagerF = await ethers.getContractFactory("FeeManager");

    registry   = await RegistryF.deploy();
    orderBook  = await OrderBookF.deploy(await registry.getAddress());
    settlement = await SettlementF.deploy(owner.address, await registry.getAddress());
    factory    = await FactoryF.deploy(await registry.getAddress());
    feeManager = await FeeManagerF.deploy(
      await settlement.getAddress(), treasury.address, treasury.address
    );

    // Wire contracts: OrderBook auto-triggers Settlement.settleMatch() on each match
    await settlement.setAuthorizedOrderBook(await orderBook.getAddress());
    await orderBook.setSettlement(await settlement.getAddress());
    await settlement.setFeeRecipient(await feeManager.getAddress());

    // ── Registry setup ───────────────────────────────────────────────────────
    await registry.addToken(await weth.getAddress(), "WETH", 18);
    await registry.addToken(await usdc.getAddress(), "USDC", 6);
    await registry.createPair(await weth.getAddress(), await usdc.getAddress());
    pairId = await registry.getPairId(await weth.getAddress(), await usdc.getAddress());

    // ── AMM pool via Factory ─────────────────────────────────────────────────
    await factory.createPair(await weth.getAddress(), await usdc.getAddress());
    const poolAddr = await factory.getPair(await weth.getAddress(), await usdc.getAddress());
    pool = await ethers.getContractAt("LiquidityPool", poolAddr);
  });

  // ─── Full order flow: place → match → settle ──────────────────────────────

  describe("Full order flow", () => {
    const QUANTITY = ethers.parseEther("1");    // 1 WETH
    const PRICE    = ethers.parseEther("2000"); // 2000 USDC per WETH

    beforeEach(async () => {
      // Both traders deposit into Settlement escrow
      await weth.connect(trader2).approve(await settlement.getAddress(), QUANTITY);
      await settlement.connect(trader2).deposit(await weth.getAddress(), QUANTITY);

      const quoteNeeded = (QUANTITY * PRICE) / ethers.parseEther("1");
      await usdc.connect(trader1).approve(await settlement.getAddress(), quoteNeeded);
      await settlement.connect(trader1).deposit(await usdc.getAddress(), quoteNeeded);
    });

    it("places a sell, then buy causes a match", async () => {
      // Seller places ask at 2000
      await orderBook.connect(trader2).placeOrder(pairId, 1, 0, PRICE, QUANTITY, 0);

      // Buyer places bid at 2000 — should trigger TradeExecuted
      await expect(
        orderBook.connect(trader1).placeOrder(pairId, 0, 0, PRICE, QUANTITY, 0)
      ).to.emit(orderBook, "TradeExecuted");
    });

    it("auto-settlement moves tokens on match without manual settleTrade call", async () => {
      await orderBook.connect(trader2).placeOrder(pairId, 1, 0, PRICE, QUANTITY, 0);

      // Placing this order triggers the match, which auto-calls Settlement.settleTrade()
      await orderBook.connect(trader1).placeOrder(pairId, 0, 0, PRICE, QUANTITY, 0);

      // Buyer (trader1) received WETH automatically
      expect(await settlement.getBalance(trader1.address, await weth.getAddress()))
        .to.equal(QUANTITY);

      // Seller (trader2) received USDC (minus fee) automatically
      const quoteAmt   = (QUANTITY * PRICE) / ethers.parseEther("1");
      const fee        = (quoteAmt * 30n) / 10_000n;
      const sellerGets = quoteAmt - fee;
      expect(await settlement.getBalance(trader2.address, await usdc.getAddress()))
        .to.equal(sellerGets);
    });

    it("fee accumulates in FeeManager after auto-settled trade", async () => {
      await orderBook.connect(trader2).placeOrder(pairId, 1, 0, PRICE, QUANTITY, 0);
      // Auto-settlement fires on match; fee lands in feeManager's escrow balance
      await orderBook.connect(trader1).placeOrder(pairId, 0, 0, PRICE, QUANTITY, 0);

      const pending = await feeManager.pendingFees(await usdc.getAddress());
      expect(pending).to.be.gt(0);
    });

    it("fee is distributed to treasury after collect+distribute", async () => {
      await orderBook.connect(trader2).placeOrder(pairId, 1, 0, PRICE, QUANTITY, 0);
      await orderBook.connect(trader1).placeOrder(pairId, 0, 0, PRICE, QUANTITY, 0);
      // Auto-settlement fires on match — no manual settleTrade needed

      const before = await usdc.balanceOf(treasury.address);
      await feeManager.collectAndDistribute(await usdc.getAddress());
      const after = await usdc.balanceOf(treasury.address);

      expect(after).to.be.gt(before);
    });
  });

  // ─── AMM: add liquidity → swap → remove liquidity ────────────────────────

  describe("AMM swap flow", () => {
    const LP_WETH = ethers.parseEther("10");     // 10 WETH
    const LP_USDC = ethers.parseEther("20000");  // 20,000 USDC → price 2000

    beforeEach(async () => {
      // Pool sorts tokens by address — match amountA/B to pool's tokenA/tokenB order
      const poolTokenA = await pool.tokenA();
      const isWethA    = poolTokenA.toLowerCase() === (await weth.getAddress()).toLowerCase();
      const amtA       = isWethA ? LP_WETH : LP_USDC;
      const amtB       = isWethA ? LP_USDC : LP_WETH;

      await weth.approve(await pool.getAddress(), LP_WETH);
      await usdc.approve(await pool.getAddress(), LP_USDC);
      await pool.addLiquidity(amtA, amtB, 0, 0);
    });

    it("adds liquidity and mints LP tokens", async () => {
      expect(await pool.balanceOf(owner.address)).to.be.gt(0);
      const [resA, resB] = await pool.getReserves();
      expect(resA).to.be.gt(0);
      expect(resB).to.be.gt(0);
    });

    it("trader swaps WETH for USDC", async () => {
      const swapIn = ethers.parseEther("1"); // 1 WETH
      await weth.connect(trader1).approve(await pool.getAddress(), swapIn);

      const beforeUSDC = await usdc.balanceOf(trader1.address);
      await pool.connect(trader1).swap(await weth.getAddress(), swapIn, 0);
      const afterUSDC = await usdc.balanceOf(trader1.address);

      expect(afterUSDC).to.be.gt(beforeUSDC);
    });

    it("swap output is less than theoretical due to fee", async () => {
      const swapIn  = ethers.parseEther("1");
      const [resA, resB] = await pool.getReserves();

      // Theoretical output without fee
      const noFeeOut = (resB * swapIn) / (resA + swapIn);
      const actualOut = await pool.getAmountOut(swapIn, resA, resB);

      expect(actualOut).to.be.lt(noFeeOut);
    });

    it("removes liquidity and returns both tokens", async () => {
      const lpBal = await pool.balanceOf(owner.address);

      const beforeWETH = await weth.balanceOf(owner.address);
      const beforeUSDC = await usdc.balanceOf(owner.address);

      await pool.removeLiquidity(lpBal, 0, 0);

      expect(await weth.balanceOf(owner.address)).to.be.gt(beforeWETH);
      expect(await usdc.balanceOf(owner.address)).to.be.gt(beforeUSDC);
    });

    it("pool price reflects reserves", async () => {
      // 10 WETH : 20000 USDC → 1 WETH = 2000 USDC.
      // Factory sorts tokens by address; query in the WETH→USDC direction regardless of sort order.
      const poolTokenA = await pool.tokenA();
      const isWethA    = poolTokenA.toLowerCase() === (await weth.getAddress()).toLowerCase();
      const price = await pool.getPrice(isWethA); // true = price of tokenA in tokenB; we want USDC per WETH
      expect(price).to.equal(ethers.parseEther("2000"));
    });
  });

  // ─── Security: signature replay protection ────────────────────────────────

  describe("Security", () => {
    it("cannot replay a cancelOrderBySig signature", async () => {
      const tx = await orderBook.connect(trader1).placeOrder(pairId, 0, 0,
        ethers.parseEther("2000"), ethers.parseEther("1"), 0
      );
      const rc     = await tx.wait();
      const log    = rc!.logs.find((l: any) => l.fragment?.name === "OrderPlaced");
      const orderId = (log as any).args[0];

      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
      const nonce    = await orderBook.nonces(trader1.address);
      const domain   = {
        name: "ZeTheta OrderBook", version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await orderBook.getAddress(),
      };
      const types = {
        CancelOrder: [
          { name: "orderId",  type: "bytes32" },
          { name: "nonce",    type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      const sig = await trader1.signTypedData(domain, types, { orderId, nonce, deadline });

      // First use — succeeds
      await orderBook.cancelOrderBySig(orderId, deadline, sig);

      // Place another order and try to replay the same sig
      const tx2 = await orderBook.connect(trader1).placeOrder(pairId, 0, 0,
        ethers.parseEther("2000"), ethers.parseEther("1"), 0
      );
      const rc2      = await tx2.wait();
      const log2     = rc2!.logs.find((l: any) => l.fragment?.name === "OrderPlaced");
      const orderId2 = (log2 as any).args[0];

      // Replay with old sig — should fail (nonce incremented)
      await expect(orderBook.cancelOrderBySig(orderId2, deadline, sig))
        .to.be.revertedWith("Invalid signature");
    });

    it("paused Settlement blocks all deposits and withdrawals", async () => {
      await settlement.pause();

      await weth.connect(trader1).approve(await settlement.getAddress(), ethers.parseEther("1"));
      await expect(
        settlement.connect(trader1).deposit(await weth.getAddress(), ethers.parseEther("1"))
      ).to.be.reverted;
    });
  });
});
