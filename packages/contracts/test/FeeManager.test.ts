import { expect } from "chai";
import { ethers } from "hardhat";
import { FeeManager, Settlement } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("FeeManager", () => {
  let feeManager: FeeManager;
  let settlement: Settlement;
  let owner: SignerWithAddress;
  let treasury: SignerWithAddress;
  let lpPool: SignerWithAddress;
  let buyer: SignerWithAddress;
  let seller: SignerWithAddress;
  let token: any;

  const SUPPLY   = ethers.parseEther("1000000");
  const DEPOSIT  = ethers.parseEther("1000");
  const QUANTITY = ethers.parseEther("1");
  const PRICE    = ethers.parseEther("500");

  beforeEach(async () => {
    [owner, treasury, lpPool, buyer, seller] = await ethers.getSigners();

    const ERC20 = await ethers.getContractFactory("MockERC20");
    token = await ERC20.deploy("USD Coin", "USDC", SUPPLY);
    await token.transfer(buyer.address, DEPOSIT);

    // Deploy Settlement with FeeManager as feeRecipient (set after); no registry needed here
    const SettlementF = await ethers.getContractFactory("Settlement");
    settlement = await SettlementF.deploy(owner.address, ethers.ZeroAddress);

    const FeeManagerF = await ethers.getContractFactory("FeeManager");
    feeManager = await FeeManagerF.deploy(
      await settlement.getAddress(),
      treasury.address,
      lpPool.address
    );

    // Wire: settlement fees → feeManager
    await settlement.setFeeRecipient(await feeManager.getAddress());
  });

  async function generateFee() {
    // Deploy a second token for base
    const ERC20 = await ethers.getContractFactory("MockERC20");
    const base  = await ERC20.deploy("ETH", "WETH", SUPPLY);
    await base.transfer(seller.address, QUANTITY);

    // Both parties deposit
    await base.connect(seller).approve(await settlement.getAddress(), QUANTITY);
    await settlement.connect(seller).deposit(await base.getAddress(), QUANTITY);

    await token.connect(buyer).approve(await settlement.getAddress(), DEPOSIT);
    await settlement.connect(buyer).deposit(await token.getAddress(), DEPOSIT);

    // Settle a trade — fee goes to feeManager
    await settlement.settleTrade(
      buyer.address, seller.address,
      await base.getAddress(), await token.getAddress(),
      QUANTITY, PRICE, 0, 0
    );

    return token;
  }

  // ─── collectFees ──────────────────────────────────────────────────────────

  describe("collectFees", () => {
    it("pulls fees from Settlement into FeeManager", async () => {
      const quoteToken = await generateFee();
      const tokenAddr  = await quoteToken.getAddress();

      const pending = await feeManager.pendingFees(tokenAddr);
      expect(pending).to.be.gt(0);

      await feeManager.collectFees(tokenAddr);

      const balance = await quoteToken.balanceOf(await feeManager.getAddress());
      expect(balance).to.equal(pending);
    });

    it("emits FeesCollected", async () => {
      const quoteToken = await generateFee();
      const tokenAddr  = await quoteToken.getAddress();

      await expect(feeManager.collectFees(tokenAddr))
        .to.emit(feeManager, "FeesCollected");
    });

    it("reverts when no fees pending", async () => {
      await expect(feeManager.collectFees(await token.getAddress()))
        .to.be.revertedWith("No fees to collect");
    });

    it("updates totalCollected", async () => {
      const quoteToken = await generateFee();
      const tokenAddr  = await quoteToken.getAddress();
      const pending    = await feeManager.pendingFees(tokenAddr);

      await feeManager.collectFees(tokenAddr);
      expect(await feeManager.totalCollected(tokenAddr)).to.equal(pending);
    });
  });

  // ─── distributeFees ───────────────────────────────────────────────────────

  describe("distributeFees", () => {
    it("splits fees 50/50 between treasury and LP pool by default", async () => {
      const quoteToken = await generateFee();
      const tokenAddr  = await quoteToken.getAddress();

      await feeManager.collectFees(tokenAddr);
      const balance = await quoteToken.balanceOf(await feeManager.getAddress());

      const beforeTreasury = await quoteToken.balanceOf(treasury.address);
      const beforeLP       = await quoteToken.balanceOf(lpPool.address);

      await feeManager.distributeFees(tokenAddr);

      const afterTreasury = await quoteToken.balanceOf(treasury.address);
      const afterLP       = await quoteToken.balanceOf(lpPool.address);

      expect(afterTreasury - beforeTreasury).to.equal(balance / 2n);
      expect(afterLP       - beforeLP      ).to.equal(balance / 2n);
    });

    it("emits FeesDistributed", async () => {
      const quoteToken = await generateFee();
      const tokenAddr  = await quoteToken.getAddress();
      await feeManager.collectFees(tokenAddr);
      await expect(feeManager.distributeFees(tokenAddr))
        .to.emit(feeManager, "FeesDistributed");
    });

    it("reverts when nothing to distribute", async () => {
      await expect(feeManager.distributeFees(await token.getAddress()))
        .to.be.revertedWith("Nothing to distribute");
    });

    it("reverts for non-owner", async () => {
      const quoteToken = await generateFee();
      const tokenAddr  = await quoteToken.getAddress();
      await feeManager.collectFees(tokenAddr);
      await expect(feeManager.connect(buyer).distributeFees(tokenAddr))
        .to.be.reverted;
    });
  });

  // ─── collectAndDistribute ─────────────────────────────────────────────────

  describe("collectAndDistribute", () => {
    it("collects and distributes in one call", async () => {
      const quoteToken = await generateFee();
      const tokenAddr  = await quoteToken.getAddress();

      const beforeTreasury = await quoteToken.balanceOf(treasury.address);
      await feeManager.collectAndDistribute(tokenAddr);
      const afterTreasury  = await quoteToken.balanceOf(treasury.address);

      expect(afterTreasury).to.be.gt(beforeTreasury);
    });
  });

  // ─── config ───────────────────────────────────────────────────────────────

  describe("config", () => {
    it("owner can change treasury share", async () => {
      await feeManager.setTreasuryShareBps(7000); // 70%
      expect(await feeManager.treasuryShareBps()).to.equal(7000);
    });

    it("reverts if share exceeds 100%", async () => {
      await expect(feeManager.setTreasuryShareBps(10001))
        .to.be.revertedWith("Cannot exceed 100%");
    });

    it("owner can update treasury address", async () => {
      await feeManager.setTreasury(buyer.address);
      expect(await feeManager.treasury()).to.equal(buyer.address);
    });

    it("reverts zero address for treasury", async () => {
      await expect(feeManager.setTreasury(ethers.ZeroAddress))
        .to.be.revertedWith("Invalid address");
    });
  });
});
