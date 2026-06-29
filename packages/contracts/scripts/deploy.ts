import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploy all ZeTheta DEX contracts.
 *
 * Deployment order (respects constructor deps):
 *   1. TokenRegistry   (no deps)
 *   2. LiquidityPool   (no deps — Factory deploys new instances per pair)
 *   3. Settlement      (needs feeRecipient placeholder + registry)
 *   4. FeeManager      (needs settlement, treasury, lpRewardPool)
 *   5. Factory         (needs registry)
 *   6. OrderBook       (needs registry)
 *   Wire: Settlement.feeRecipient       → FeeManager
 *         Settlement.authorizedOrderBook → OrderBook
 *         OrderBook.settlement           → Settlement
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId    = (await ethers.provider.getNetwork()).chainId;

  console.log("Deploying with:", deployer.address);
  console.log("Network:", network.name, `(chain ${chainId})`);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH\n");

  if (balance === 0n) {
    throw new Error("Deployer has 0 ETH — fund the wallet first");
  }

  // ── 1. TokenRegistry ──────────────────────────────────────────────────────

  console.log("1/6  Deploying TokenRegistry...");
  const TokenRegistry = await ethers.getContractFactory("TokenRegistry");
  const registry = await TokenRegistry.deploy();
  await registry.waitForDeployment();
  const registryAddr = await registry.getAddress();
  console.log("     TokenRegistry:", registryAddr);

  // ── 2. Settlement ─────────────────────────────────────────────────────────
  // Use deployer as temporary feeRecipient; replaced by FeeManager in wiring step.

  console.log("2/6  Deploying Settlement...");
  const Settlement = await ethers.getContractFactory("Settlement");
  const settlement = await Settlement.deploy(deployer.address, registryAddr);
  await settlement.waitForDeployment();
  const settlementAddr = await settlement.getAddress();
  console.log("     Settlement:", settlementAddr);

  // ── 3. FeeManager ─────────────────────────────────────────────────────────
  // On testnet: deployer acts as treasury and LP reward pool.
  // Replace with real multisig addresses before mainnet.

  const treasury     = deployer.address;
  const lpRewardPool = deployer.address;

  console.log("3/6  Deploying FeeManager...");
  const FeeManager = await ethers.getContractFactory("FeeManager");
  const feeManager = await FeeManager.deploy(settlementAddr, treasury, lpRewardPool);
  await feeManager.waitForDeployment();
  const feeManagerAddr = await feeManager.getAddress();
  console.log("     FeeManager:", feeManagerAddr);

  // ── 4. Factory ────────────────────────────────────────────────────────────

  console.log("4/6  Deploying Factory...");
  const Factory = await ethers.getContractFactory("Factory");
  const factory = await Factory.deploy(registryAddr);
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();
  console.log("     Factory:", factoryAddr);

  // ── 5. OrderBook ──────────────────────────────────────────────────────────

  console.log("5/6  Deploying OrderBook...");
  const OrderBook = await ethers.getContractFactory("OrderBook");
  const orderBook = await OrderBook.deploy(registryAddr);
  await orderBook.waitForDeployment();
  const orderBookAddr = await orderBook.getAddress();
  console.log("     OrderBook:", orderBookAddr);

  // ── 6. LiquidityPool implementation ──────────────────────────────────────
  // Not deployed directly here — Factory.createPair() deploys individual pools.
  // We deploy one instance so Factory has bytecode to clone.

  console.log("6/6  Deploying LiquidityPool implementation (for reference)...");
  const LiquidityPool = await ethers.getContractFactory("LiquidityPool");
  // Use zero addresses as placeholder — this instance is never used directly.
  // Real pools are deployed by Factory.createPair(tokenA, tokenB).
  const lpImpl = await LiquidityPool.deploy(
    ethers.ZeroAddress,
    ethers.ZeroAddress
  ).catch(() => null);
  const lpImplAddr = lpImpl ? await lpImpl.getAddress() : "(skipped — zero addresses rejected)";
  console.log("     LiquidityPool impl:", lpImplAddr);

  // ── Wiring ────────────────────────────────────────────────────────────────

  console.log("\nWiring contracts...");

  let tx = await (settlement as any).setFeeRecipient(feeManagerAddr);
  await tx.wait();
  console.log("  Settlement.feeRecipient       →", feeManagerAddr);

  tx = await (settlement as any).setAuthorizedOrderBook(orderBookAddr);
  await tx.wait();
  console.log("  Settlement.authorizedOrderBook →", orderBookAddr);

  tx = await (orderBook as any).setSettlement(settlementAddr);
  await tx.wait();
  console.log("  OrderBook.settlement           →", settlementAddr);

  // ── Save deployment ───────────────────────────────────────────────────────

  const deployment = {
    network:    network.name,
    chainId:    chainId.toString(),
    deployer:   deployer.address,
    deployedAt: new Date().toISOString(),
    contracts: {
      TokenRegistry:  registryAddr,
      Settlement:     settlementAddr,
      FeeManager:     feeManagerAddr,
      Factory:        factoryAddr,
      OrderBook:      orderBookAddr,
      LiquidityPoolImpl: typeof lpImplAddr === 'string' ? lpImplAddr : "",
    },
  };

  const outDir  = path.join(__dirname, "..", "deployments");
  const outFile = path.join(outDir, `${network.name}.json`);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(deployment, null, 2));

  console.log("\nDeployment complete →", outFile);
  console.table(deployment.contracts);

  console.log("\nNext steps:");
  console.log("  1. Verify on Etherscan:");
  console.log(`     npx hardhat verify --network ${network.name} ${registryAddr}`);
  console.log(`     npx hardhat verify --network ${network.name} ${settlementAddr} ${deployer.address} ${registryAddr}`);
  console.log(`     npx hardhat verify --network ${network.name} ${orderBookAddr} ${registryAddr}`);
  console.log("  2. Update subgraph with deployed addresses:");
  console.log(`     node scripts/update-subgraph.js ${network.name}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
