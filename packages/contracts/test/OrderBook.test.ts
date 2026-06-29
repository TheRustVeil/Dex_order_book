import { expect } from "chai";
import { ethers } from "hardhat";
import { OrderBook, TokenRegistry } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("OrderBook", () => {
  let orderBook: OrderBook;
  let registry: TokenRegistry;
  let owner: SignerWithAddress;
  let trader1: SignerWithAddress;
  let trader2: SignerWithAddress;
  let pairId: string;

  const PRICE    = ethers.parseEther("500");
  const QUANTITY = ethers.parseEther("1");
  const NO_EXPIRY = 0n;

  beforeEach(async () => {
    [owner, trader1, trader2] = await ethers.getSigners();

    const RegistryFactory = await ethers.getContractFactory("TokenRegistry");
    registry = await RegistryFactory.deploy();

    const BookFactory = await ethers.getContractFactory("OrderBook");
    orderBook = await BookFactory.deploy(await registry.getAddress());

    // Register two tokens and create a pair
    await registry.addToken(trader1.address, "TKA", 18);
    await registry.addToken(trader2.address, "TKB", 18);
    await registry.createPair(trader1.address, trader2.address);
    pairId = await registry.getPairId(trader1.address, trader2.address);
  });

  // ─── placeOrder ───────────────────────────────────────────────────────────

  describe("placeOrder", () => {
    it("places a limit buy order", async () => {
      const tx = await orderBook.connect(trader1).placeOrder(
        pairId, 0, 0, PRICE, QUANTITY, NO_EXPIRY
      );
      await expect(tx).to.emit(orderBook, "OrderPlaced");
    });

    it("places a limit sell order", async () => {
      await expect(
        orderBook.connect(trader2).placeOrder(pairId, 1, 0, PRICE, QUANTITY, NO_EXPIRY)
      ).to.emit(orderBook, "OrderPlaced");
    });

    it("stores order data correctly", async () => {
      const tx = await orderBook.connect(trader1).placeOrder(
        pairId, 0, 0, PRICE, QUANTITY, NO_EXPIRY
      );
      const rc     = await tx.wait();
      const log    = rc!.logs.find((l: any) => l.fragment?.name === "OrderPlaced");
      const orderId = (log as any).args[0];

      const order = await orderBook.getOrder(orderId);
      expect(order.trader).to.equal(trader1.address);
      expect(order.price).to.equal(PRICE);
      expect(order.quantity).to.equal(QUANTITY);
      expect(order.status).to.equal(0); // OPEN
    });

    it("reverts for inactive pair", async () => {
      const badPairId = ethers.keccak256(ethers.toUtf8Bytes("bad"));
      await expect(
        orderBook.connect(trader1).placeOrder(badPairId, 0, 0, PRICE, QUANTITY, NO_EXPIRY)
      ).to.be.revertedWith("Pair not active");
    });

    it("reverts for zero quantity", async () => {
      await expect(
        orderBook.connect(trader1).placeOrder(pairId, 0, 0, PRICE, 0n, NO_EXPIRY)
      ).to.be.revertedWith("Quantity must be > 0");
    });

    it("reverts for expired order", async () => {
      const pastExpiry = BigInt(Math.floor(Date.now() / 1000) - 100);
      await expect(
        orderBook.connect(trader1).placeOrder(pairId, 0, 0, PRICE, QUANTITY, pastExpiry)
      ).to.be.revertedWith("Expiry in the past");
    });

    it("reverts when paused", async () => {
      await orderBook.pause();
      await expect(
        orderBook.connect(trader1).placeOrder(pairId, 0, 0, PRICE, QUANTITY, NO_EXPIRY)
      ).to.be.reverted;
    });
  });

  // ─── cancelOrder ──────────────────────────────────────────────────────────

  describe("cancelOrder", () => {
    let orderId: string;

    beforeEach(async () => {
      const tx = await orderBook.connect(trader1).placeOrder(
        pairId, 0, 0, PRICE, QUANTITY, NO_EXPIRY
      );
      const rc = await tx.wait();
      const log = rc!.logs.find((l: any) => l.fragment?.name === "OrderPlaced");
      orderId = (log as any).args[0];
    });

    it("cancels own order", async () => {
      await expect(orderBook.connect(trader1).cancelOrder(orderId))
        .to.emit(orderBook, "OrderCancelled")
        .withArgs(orderId);

      const order = await orderBook.getOrder(orderId);
      expect(order.status).to.equal(3); // CANCELLED
    });

    it("reverts when non-owner tries to cancel", async () => {
      await expect(orderBook.connect(trader2).cancelOrder(orderId))
        .to.be.revertedWith("Not order owner");
    });
  });

  // ─── matching ─────────────────────────────────────────────────────────────

  describe("matching", () => {
    it("matches a buy and sell at crossing prices", async () => {
      // Sell at 500 — posted first (maker)
      await orderBook.connect(trader2).placeOrder(pairId, 1, 0, PRICE, QUANTITY, NO_EXPIRY);

      // Buy at 500 — should match immediately
      await expect(
        orderBook.connect(trader1).placeOrder(pairId, 0, 0, PRICE, QUANTITY, NO_EXPIRY)
      ).to.emit(orderBook, "TradeExecuted");
    });

    it("does not match when bid < ask", async () => {
      const lowBid  = ethers.parseEther("400");
      const highAsk = ethers.parseEther("500");

      await orderBook.connect(trader2).placeOrder(pairId, 1, 0, highAsk, QUANTITY, NO_EXPIRY);
      const tx = await orderBook.connect(trader1).placeOrder(
        pairId, 0, 0, lowBid, QUANTITY, NO_EXPIRY
      );
      await expect(tx).to.not.emit(orderBook, "TradeExecuted");
    });

    it("partial fill updates filled amount", async () => {
      const halfQty = QUANTITY / 2n;

      // Sell 0.5
      const tx1 = await orderBook.connect(trader2).placeOrder(
        pairId, 1, 0, PRICE, halfQty, NO_EXPIRY
      );
      const rc1    = await tx1.wait();
      const sellLog = rc1!.logs.find((l: any) => l.fragment?.name === "OrderPlaced");
      const sellId  = (sellLog as any).args[0];

      // Buy 1 — should partially fill
      const tx2 = await orderBook.connect(trader1).placeOrder(
        pairId, 0, 0, PRICE, QUANTITY, NO_EXPIRY
      );
      await expect(tx2).to.emit(orderBook, "TradeExecuted");

      const sellOrder = await orderBook.getOrder(sellId);
      expect(sellOrder.status).to.equal(1); // FILLED (sell was halfQty, fully consumed)
    });
  });

  // ─── EIP-712 cancelOrderBySig ─────────────────────────────────────────────

  describe("cancelOrderBySig", () => {
    let orderId: string;

    beforeEach(async () => {
      const tx = await orderBook.connect(trader1).placeOrder(
        pairId, 0, 0, PRICE, QUANTITY, NO_EXPIRY
      );
      const rc  = await tx.wait();
      const log = rc!.logs.find((l: any) => l.fragment?.name === "OrderPlaced");
      orderId   = (log as any).args[0];
    });

    it("cancels via valid EIP-712 signature", async () => {
      const deadline    = BigInt(Math.floor(Date.now() / 1000) + 3600);
      const nonce       = await orderBook.nonces(trader1.address);
      const domain      = {
        name: "ZeTheta OrderBook",
        version: "1",
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
      const value = { orderId, nonce, deadline };
      const sig   = await trader1.signTypedData(domain, types, value);

      await expect(orderBook.cancelOrderBySig(orderId, deadline, sig))
        .to.emit(orderBook, "OrderCancelled")
        .withArgs(orderId);
    });

    it("reverts with wrong signer", async () => {
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
      // trader2 signs but trader1 owns the order
      const sig = await trader2.signTypedData(domain, types, { orderId, nonce, deadline });
      await expect(orderBook.cancelOrderBySig(orderId, deadline, sig))
        .to.be.revertedWith("Invalid signature");
    });
  });

  // ─── views ────────────────────────────────────────────────────────────────

  describe("views", () => {
    it("getBestBid returns highest bid", async () => {
      await orderBook.connect(trader1).placeOrder(pairId, 0, 0, ethers.parseEther("400"), QUANTITY, NO_EXPIRY);
      await orderBook.connect(trader1).placeOrder(pairId, 0, 0, ethers.parseEther("500"), QUANTITY, NO_EXPIRY);
      const [price] = await orderBook.getBestBid(pairId);
      expect(price).to.equal(ethers.parseEther("500"));
    });

    it("getBestAsk returns lowest ask", async () => {
      await orderBook.connect(trader2).placeOrder(pairId, 1, 0, ethers.parseEther("600"), QUANTITY, NO_EXPIRY);
      await orderBook.connect(trader2).placeOrder(pairId, 1, 0, ethers.parseEther("500"), QUANTITY, NO_EXPIRY);
      const [price] = await orderBook.getBestAsk(pairId);
      expect(price).to.equal(ethers.parseEther("500"));
    });

    it("getTraderOrders returns all order ids", async () => {
      await orderBook.connect(trader1).placeOrder(pairId, 0, 0, PRICE, QUANTITY, NO_EXPIRY);
      await orderBook.connect(trader1).placeOrder(pairId, 0, 0, PRICE, QUANTITY, NO_EXPIRY);
      const ids = await orderBook.getTraderOrders(trader1.address);
      expect(ids.length).to.equal(2);
    });
  });
});
