import { expect } from "chai";
import { ethers } from "hardhat";
import { Factory, TokenRegistry } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Factory", () => {
  let factory: Factory;
  let registry: TokenRegistry;
  let owner: SignerWithAddress;
  let other: SignerWithAddress;
  let tokenA: string;
  let tokenB: string;

  beforeEach(async () => {
    [owner, other] = await ethers.getSigners();

    const RegistryFactory = await ethers.getContractFactory("TokenRegistry");
    registry = await RegistryFactory.deploy();

    const FactoryContract = await ethers.getContractFactory("Factory");
    factory = await FactoryContract.deploy(await registry.getAddress());

    // Register two tokens
    const [, a, b] = await ethers.getSigners();
    tokenA = a.address;
    tokenB = b.address;
    await registry.addToken(tokenA, "TKA", 18);
    await registry.addToken(tokenB, "TKB", 18);
  });

  // ─── createPair ───────────────────────────────────────────────────────────

  describe("createPair", () => {
    it("deploys a LiquidityPool", async () => {
      await factory.createPair(tokenA, tokenB);
      const pool = await factory.getPair(tokenA, tokenB);
      expect(pool).to.not.equal(ethers.ZeroAddress);
    });

    it("emits PairCreated", async () => {
      await expect(factory.createPair(tokenA, tokenB))
        .to.emit(factory, "PairCreated");
    });

    it("getPair(A,B) == getPair(B,A) — order-independent", async () => {
      await factory.createPair(tokenA, tokenB);
      const ab = await factory.getPair(tokenA, tokenB);
      const ba = await factory.getPair(tokenB, tokenA);
      expect(ab).to.equal(ba);
    });

    it("reverts on duplicate pair", async () => {
      await factory.createPair(tokenA, tokenB);
      await expect(factory.createPair(tokenA, tokenB))
        .to.be.revertedWith("Pair already exists");
    });

    it("reverts for identical tokens", async () => {
      await expect(factory.createPair(tokenA, tokenA))
        .to.be.revertedWith("Identical tokens");
    });

    it("reverts for unregistered token", async () => {
      // Use a fresh address that is definitely not tokenA or tokenB
      const unregistered = ethers.Wallet.createRandom().address;
      await expect(factory.createPair(tokenA, unregistered))
        .to.be.revertedWith("TokenB not registered");
    });

    it("reverts for non-owner", async () => {
      await expect(factory.connect(other).createPair(tokenA, tokenB))
        .to.be.reverted;
    });
  });

  // ─── views ────────────────────────────────────────────────────────────────

  describe("views", () => {
    it("allPairsLength increments", async () => {
      expect(await factory.allPairsLength()).to.equal(0);
      await factory.createPair(tokenA, tokenB);
      expect(await factory.allPairsLength()).to.equal(1);
    });

    it("getPair returns zero for nonexistent pair", async () => {
      const pool = await factory.getPair(tokenA, tokenB);
      expect(pool).to.equal(ethers.ZeroAddress);
    });
  });
});
