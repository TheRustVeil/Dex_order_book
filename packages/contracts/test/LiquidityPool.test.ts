import { expect } from "chai";
import { ethers } from "hardhat";
import { LiquidityPool } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("LiquidityPool", () => {
  let pool: LiquidityPool;
  let owner: SignerWithAddress;
  let lp: SignerWithAddress;
  let trader: SignerWithAddress;
  let tokenA: any;
  let tokenB: any;

  const SUPPLY  = ethers.parseEther("10000000"); // 10M — enough for all transfers
  const AMT_A   = ethers.parseEther("1000");     // 1000 TKA
  const AMT_B   = ethers.parseEther("500000");   // 500,000 TKB → price: 500 TKB per TKA

  beforeEach(async () => {
    [owner, lp, trader] = await ethers.getSigners();

    const ERC20 = await ethers.getContractFactory("MockERC20");
    tokenA = await ERC20.deploy("Token A", "TKA", SUPPLY);
    tokenB = await ERC20.deploy("Token B", "TKB", SUPPLY);

    await tokenA.transfer(lp.address,     AMT_A * 2n);
    await tokenA.transfer(trader.address, AMT_A);
    await tokenB.transfer(lp.address,     AMT_B * 2n);
    await tokenB.transfer(trader.address, AMT_B);

    const Factory = await ethers.getContractFactory("LiquidityPool");
    pool = await Factory.deploy(await tokenA.getAddress(), await tokenB.getAddress());
  });

  async function addLiquidity(signer: SignerWithAddress, amtA = AMT_A, amtB = AMT_B) {
    await tokenA.connect(signer).approve(await pool.getAddress(), amtA);
    await tokenB.connect(signer).approve(await pool.getAddress(), amtB);
    return pool.connect(signer).addLiquidity(amtA, amtB, 0, 0);
  }

  // ─── addLiquidity ─────────────────────────────────────────────────────────

  describe("addLiquidity", () => {
    it("mints LP tokens on first deposit", async () => {
      await addLiquidity(lp);
      expect(await pool.balanceOf(lp.address)).to.be.gt(0);
    });

    it("updates reserves", async () => {
      await addLiquidity(lp);
      const [resA, resB] = await pool.getReserves();
      expect(resA).to.equal(AMT_A);
      expect(resB).to.equal(AMT_B);
    });

    it("emits LiquidityAdded", async () => {
      await tokenA.connect(lp).approve(await pool.getAddress(), AMT_A);
      await tokenB.connect(lp).approve(await pool.getAddress(), AMT_B);
      await expect(pool.connect(lp).addLiquidity(AMT_A, AMT_B, 0, 0))
        .to.emit(pool, "LiquidityAdded");
    });

    it("reverts when paused", async () => {
      await pool.pause();
      await expect(addLiquidity(lp)).to.be.reverted;
    });
  });

  // ─── removeLiquidity ──────────────────────────────────────────────────────

  describe("removeLiquidity", () => {
    beforeEach(async () => { await addLiquidity(lp); });

    it("returns tokens proportionally", async () => {
      const lpBal = await pool.balanceOf(lp.address);
      const halfLp = lpBal / 2n;

      const beforeA = await tokenA.balanceOf(lp.address);
      const beforeB = await tokenB.balanceOf(lp.address);

      await pool.connect(lp).removeLiquidity(halfLp, 0, 0);

      const afterA = await tokenA.balanceOf(lp.address);
      const afterB = await tokenB.balanceOf(lp.address);

      expect(afterA).to.be.gt(beforeA);
      expect(afterB).to.be.gt(beforeB);
    });

    it("burns LP tokens", async () => {
      const lpBal = await pool.balanceOf(lp.address);
      await pool.connect(lp).removeLiquidity(lpBal, 0, 0);
      expect(await pool.balanceOf(lp.address)).to.equal(0);
    });

    it("emits LiquidityRemoved", async () => {
      const lpBal = await pool.balanceOf(lp.address);
      await expect(pool.connect(lp).removeLiquidity(lpBal, 0, 0))
        .to.emit(pool, "LiquidityRemoved");
    });

    it("reverts on slippage", async () => {
      const lpBal = await pool.balanceOf(lp.address);
      await expect(
        pool.connect(lp).removeLiquidity(lpBal, AMT_A + 1n, 0)
      ).to.be.revertedWith("Slippage: insufficient A");
    });
  });

  // ─── swap ─────────────────────────────────────────────────────────────────

  describe("swap", () => {
    const SWAP_IN = ethers.parseEther("10"); // swap 10 TKA

    beforeEach(async () => { await addLiquidity(lp); });

    it("gives tokenB out for tokenA in", async () => {
      await tokenA.connect(trader).approve(await pool.getAddress(), SWAP_IN);
      const before = await tokenB.balanceOf(trader.address);
      await pool.connect(trader).swap(await tokenA.getAddress(), SWAP_IN, 0);
      const after = await tokenB.balanceOf(trader.address);
      expect(after).to.be.gt(before);
    });

    it("gives tokenA out for tokenB in", async () => {
      const swapB = ethers.parseEther("5000");
      await tokenB.connect(trader).approve(await pool.getAddress(), swapB);
      const before = await tokenA.balanceOf(trader.address);
      await pool.connect(trader).swap(await tokenB.getAddress(), swapB, 0);
      const after = await tokenA.balanceOf(trader.address);
      expect(after).to.be.gt(before);
    });

    it("emits Swapped event", async () => {
      await tokenA.connect(trader).approve(await pool.getAddress(), SWAP_IN);
      await expect(pool.connect(trader).swap(await tokenA.getAddress(), SWAP_IN, 0))
        .to.emit(pool, "Swapped");
    });

    it("reverts on insufficient output (slippage)", async () => {
      await tokenA.connect(trader).approve(await pool.getAddress(), SWAP_IN);
      await expect(
        pool.connect(trader).swap(await tokenA.getAddress(), SWAP_IN, ethers.MaxUint256)
      ).to.be.revertedWith("Slippage: amountOut too low");
    });

    it("reverts for invalid tokenIn", async () => {
      await expect(
        pool.connect(trader).swap(trader.address, SWAP_IN, 0)
      ).to.be.revertedWith("Invalid tokenIn");
    });
  });

  // ─── getAmountOut ─────────────────────────────────────────────────────────

  describe("getAmountOut", () => {
    it("returns less than reserveOut", async () => {
      const out = await pool.getAmountOut(ethers.parseEther("10"), AMT_A, AMT_B);
      expect(out).to.be.lt(AMT_B);
    });

    it("accounts for 0.30% fee", async () => {
      // With no fee: out = reserveOut * in / (reserveIn + in)
      // With fee:    out should be slightly less
      const amtIn   = ethers.parseEther("100");
      const out     = await pool.getAmountOut(amtIn, AMT_A, AMT_B);
      const noFee   = (AMT_B * amtIn) / (AMT_A + amtIn);
      expect(out).to.be.lt(noFee);
    });
  });

  // ─── getPrice ─────────────────────────────────────────────────────────────

  describe("getPrice", () => {
    beforeEach(async () => { await addLiquidity(lp); });

    it("returns price of A in B", async () => {
      // 1000 TKA : 500000 TKB → 1 TKA = 500 TKB
      const price = await pool.getPrice(true);
      expect(price).to.equal(ethers.parseEther("500"));
    });

    it("returns price of B in A", async () => {
      // 1 TKB = 0.002 TKA
      const price = await pool.getPrice(false);
      expect(price).to.equal(ethers.parseEther("0.002"));
    });
  });
});
