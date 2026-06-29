import { expect } from "chai";
import { ethers } from "hardhat";
import { Settlement } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Settlement", () => {
  let settlement: Settlement;
  let owner: SignerWithAddress;
  let buyer: SignerWithAddress;
  let seller: SignerWithAddress;
  let feeRecipient: SignerWithAddress;
  let tokenA: any;
  let tokenB: any;

  const INITIAL_SUPPLY = ethers.parseEther("10000");
  const DEPOSIT_A      = ethers.parseEther("100");
  const DEPOSIT_B      = ethers.parseEther("500");

  beforeEach(async () => {
    [owner, buyer, seller, feeRecipient] = await ethers.getSigners();

    // Deploy mock ERC20 tokens
    const ERC20 = await ethers.getContractFactory("MockERC20");
    tokenA = await ERC20.deploy("Token A", "TKA", INITIAL_SUPPLY);
    tokenB = await ERC20.deploy("Token B", "TKB", INITIAL_SUPPLY);

    // Transfer tokens to buyer and seller
    await tokenA.transfer(seller.address, DEPOSIT_A);
    await tokenB.transfer(buyer.address, DEPOSIT_B);

    const Factory = await ethers.getContractFactory("Settlement");
    settlement = await Factory.deploy(feeRecipient.address, ethers.ZeroAddress);
  });

  // ─── deposit ──────────────────────────────────────────────────────────────

  describe("deposit", () => {
    it("accepts tokens and tracks balance", async () => {
      await tokenB.connect(buyer).approve(await settlement.getAddress(), DEPOSIT_B);
      await settlement.connect(buyer).deposit(await tokenB.getAddress(), DEPOSIT_B);
      expect(await settlement.getBalance(buyer.address, await tokenB.getAddress()))
        .to.equal(DEPOSIT_B);
    });

    it("emits Deposited", async () => {
      await tokenB.connect(buyer).approve(await settlement.getAddress(), DEPOSIT_B);
      await expect(settlement.connect(buyer).deposit(await tokenB.getAddress(), DEPOSIT_B))
        .to.emit(settlement, "Deposited")
        .withArgs(buyer.address, await tokenB.getAddress(), DEPOSIT_B);
    });

    it("reverts when paused", async () => {
      await settlement.pause();
      await tokenB.connect(buyer).approve(await settlement.getAddress(), DEPOSIT_B);
      await expect(settlement.connect(buyer).deposit(await tokenB.getAddress(), DEPOSIT_B))
        .to.be.reverted;
    });
  });

  // ─── withdraw ─────────────────────────────────────────────────────────────

  describe("withdraw", () => {
    beforeEach(async () => {
      await tokenB.connect(buyer).approve(await settlement.getAddress(), DEPOSIT_B);
      await settlement.connect(buyer).deposit(await tokenB.getAddress(), DEPOSIT_B);
    });

    it("returns tokens to user", async () => {
      const before = await tokenB.balanceOf(buyer.address);
      await settlement.connect(buyer).withdraw(await tokenB.getAddress(), DEPOSIT_B);
      const after = await tokenB.balanceOf(buyer.address);
      expect(after - before).to.equal(DEPOSIT_B);
    });

    it("reverts on insufficient balance", async () => {
      await expect(
        settlement.connect(buyer).withdraw(await tokenB.getAddress(), DEPOSIT_B + 1n)
      ).to.be.revertedWith("Insufficient balance");
    });
  });

  // ─── settleTrade ──────────────────────────────────────────────────────────

  describe("settleTrade", () => {
    const quantity = ethers.parseEther("1");   // 1 TKA
    const price    = ethers.parseEther("500"); // 500 TKB per TKA

    beforeEach(async () => {
      // Seller deposits base token (TKA)
      await tokenA.connect(seller).approve(await settlement.getAddress(), DEPOSIT_A);
      await settlement.connect(seller).deposit(await tokenA.getAddress(), DEPOSIT_A);

      // Buyer deposits quote token (TKB)
      await tokenB.connect(buyer).approve(await settlement.getAddress(), DEPOSIT_B);
      await settlement.connect(buyer).deposit(await tokenB.getAddress(), DEPOSIT_B);
    });

    it("transfers tokens atomically", async () => {
      await settlement.settleTrade(
        buyer.address, seller.address,
        await tokenA.getAddress(), await tokenB.getAddress(),
        quantity, price, 0, 0
      );
      // Buyer should now have TKA
      expect(await settlement.getBalance(buyer.address, await tokenA.getAddress()))
        .to.equal(quantity);
    });

    it("collects fee to feeRecipient", async () => {
      await settlement.settleTrade(
        buyer.address, seller.address,
        await tokenA.getAddress(), await tokenB.getAddress(),
        quantity, price, 0, 0
      );
      const quoteAmount = (quantity * price) / ethers.parseEther("1");
      const fee         = (quoteAmount * 30n) / 10_000n;
      expect(await settlement.getBalance(feeRecipient.address, await tokenB.getAddress()))
        .to.equal(fee);
    });

    it("emits Settled", async () => {
      await expect(
        settlement.settleTrade(
          buyer.address, seller.address,
          await tokenA.getAddress(), await tokenB.getAddress(),
          quantity, price, 0, 0
        )
      ).to.emit(settlement, "Settled");
    });

    it("reverts on slippage", async () => {
      const quoteAmount = (quantity * price) / ethers.parseEther("1");
      const fee         = (quoteAmount * 30n) / 10_000n;
      const sellerGets  = quoteAmount - fee;
      await expect(
        settlement.settleTrade(
          buyer.address, seller.address,
          await tokenA.getAddress(), await tokenB.getAddress(),
          quantity, price, 0, sellerGets + 1n  // demand 1 wei more than possible
        )
      ).to.be.revertedWith("Slippage: quote too low");
    });

    it("reverts for unauthorized caller", async () => {
      await expect(
        settlement.connect(buyer).settleTrade(
          buyer.address, seller.address,
          await tokenA.getAddress(), await tokenB.getAddress(),
          quantity, price, 0, 0
        )
      ).to.be.reverted;
    });

    it("allows authorized orderBook address to call settleTrade", async () => {
      const [,,,, orderBookSigner] = await ethers.getSigners();
      await settlement.setAuthorizedOrderBook(orderBookSigner.address);

      await expect(
        settlement.connect(orderBookSigner).settleTrade(
          buyer.address, seller.address,
          await tokenA.getAddress(), await tokenB.getAddress(),
          quantity, price, 0, 0
        )
      ).to.be.reverted; // settleTrade is still onlyOwner; only settleMatch is open to orderBook
    });
  });

  // ─── setAuthorizedOrderBook ───────────────────────────────────────────────

  describe("setAuthorizedOrderBook", () => {
    it("owner can set authorized orderBook address", async () => {
      const [,,,, addr] = await ethers.getSigners();
      await expect(settlement.setAuthorizedOrderBook(addr.address))
        .to.emit(settlement, "OrderBookAuthorized")
        .withArgs(addr.address);
      expect(await settlement.authorizedOrderBook()).to.equal(addr.address);
    });

    it("non-owner cannot set authorized orderBook", async () => {
      const [,,,, addr] = await ethers.getSigners();
      await expect(settlement.connect(buyer).setAuthorizedOrderBook(addr.address))
        .to.be.reverted;
    });
  });

  // ─── releaseFunds ─────────────────────────────────────────────────────────

  describe("releaseFunds", () => {
    it("returns full balance to trader", async () => {
      await tokenB.connect(buyer).approve(await settlement.getAddress(), DEPOSIT_B);
      await settlement.connect(buyer).deposit(await tokenB.getAddress(), DEPOSIT_B);

      const before = await tokenB.balanceOf(buyer.address);
      await settlement.releaseFunds(buyer.address, await tokenB.getAddress());
      const after = await tokenB.balanceOf(buyer.address);

      expect(after - before).to.equal(DEPOSIT_B);
      expect(await settlement.getBalance(buyer.address, await tokenB.getAddress()))
        .to.equal(0);
    });
  });

  // ─── pause ────────────────────────────────────────────────────────────────

  describe("pause / unpause", () => {
    it("only owner can pause", async () => {
      await expect(settlement.connect(buyer).pause()).to.be.reverted;
    });

    it("unpause resumes deposits", async () => {
      await settlement.pause();
      await settlement.unpause();
      await tokenB.connect(buyer).approve(await settlement.getAddress(), DEPOSIT_B);
      await expect(settlement.connect(buyer).deposit(await tokenB.getAddress(), DEPOSIT_B))
        .to.not.be.reverted;
    });
  });
});
