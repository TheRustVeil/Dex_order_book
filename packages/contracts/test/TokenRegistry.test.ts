import { expect } from "chai";
import { ethers } from "hardhat";
import { TokenRegistry } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("TokenRegistry", () => {
  let registry: TokenRegistry;
  let owner: SignerWithAddress;
  let other: SignerWithAddress;

  const SYMBOL   = "WETH";
  const DECIMALS = 18;

  beforeEach(async () => {
    [owner, other] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("TokenRegistry");
    registry = await Factory.deploy();
  });

  // ─── addToken ─────────────────────────────────────────────────────────────

  describe("addToken", () => {
    it("registers a token", async () => {
      await registry.addToken(other.address, SYMBOL, DECIMALS);
      expect(await registry.isTokenActive(other.address)).to.equal(true);
    });

    it("emits TokenAdded", async () => {
      await expect(registry.addToken(other.address, SYMBOL, DECIMALS))
        .to.emit(registry, "TokenAdded")
        .withArgs(other.address, SYMBOL, DECIMALS);
    });

    it("reverts for zero address", async () => {
      await expect(registry.addToken(ethers.ZeroAddress, SYMBOL, DECIMALS))
        .to.be.revertedWith("Invalid address");
    });

    it("reverts if token already registered", async () => {
      await registry.addToken(other.address, SYMBOL, DECIMALS);
      await expect(registry.addToken(other.address, SYMBOL, DECIMALS))
        .to.be.revertedWith("Already registered");
    });

    it("reverts for non-owner", async () => {
      await expect(
        registry.connect(other).addToken(other.address, SYMBOL, DECIMALS)
      ).to.be.reverted;
    });
  });

  // ─── removeToken ──────────────────────────────────────────────────────────

  describe("removeToken", () => {
    beforeEach(async () => {
      await registry.addToken(other.address, SYMBOL, DECIMALS);
    });

    it("deactivates a token", async () => {
      await registry.removeToken(other.address);
      expect(await registry.isTokenActive(other.address)).to.equal(false);
    });

    it("emits TokenRemoved", async () => {
      await expect(registry.removeToken(other.address))
        .to.emit(registry, "TokenRemoved")
        .withArgs(other.address);
    });

    it("reverts if already inactive", async () => {
      await registry.removeToken(other.address);
      await expect(registry.removeToken(other.address))
        .to.be.revertedWith("Token not active");
    });
  });

  // ─── createPair ───────────────────────────────────────────────────────────

  describe("createPair", () => {
    let tokenA: string;
    let tokenB: string;

    beforeEach(async () => {
      const [, a, b] = await ethers.getSigners();
      tokenA = a.address;
      tokenB = b.address;
      await registry.addToken(tokenA, "WETH", 18);
      await registry.addToken(tokenB, "USDC", 6);
    });

    it("creates a pair and returns pairId", async () => {
      const tx   = await registry.createPair(tokenA, tokenB);
      const rc   = await tx.wait();
      const log  = rc!.logs.find((l: any) => l.fragment?.name === "PairCreated");
      expect(log).to.not.be.undefined;
    });

    it("pair is active after creation", async () => {
      const pairId = await registry.getPairId(tokenA, tokenB);
      await registry.createPair(tokenA, tokenB);
      expect(await registry.isPairActive(pairId)).to.equal(true);
    });

    it("reverts for duplicate pair", async () => {
      await registry.createPair(tokenA, tokenB);
      await expect(registry.createPair(tokenA, tokenB))
        .to.be.revertedWith("Pair already exists");
    });

    it("reverts if base token not registered", async () => {
      const [, , , unregistered] = await ethers.getSigners();
      await expect(registry.createPair(unregistered.address, tokenB))
        .to.be.revertedWith("Base token not registered");
    });
  });

  // ─── views ────────────────────────────────────────────────────────────────

  describe("views", () => {
    it("getTokenCount increments", async () => {
      expect(await registry.getTokenCount()).to.equal(0);
      await registry.addToken(other.address, SYMBOL, DECIMALS);
      expect(await registry.getTokenCount()).to.equal(1);
    });
  });
});
