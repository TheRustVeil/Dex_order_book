import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-gas-reporter";
import * as dotenv from "dotenv";

dotenv.config({ path: "../../.env" });

const PRIVATE_KEY = process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
      evmVersion: "cancun",
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    // ── Testnets ─────────────────────────────────────────────────────────────
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org",
      accounts: PRIVATE_KEY,
      chainId: 11155111,
    },
    mumbai: {
      url: process.env.MUMBAI_RPC_URL || "https://rpc-mumbai.maticvigil.com",
      accounts: PRIVATE_KEY,
      chainId: 80001,
    },
    // ── Mainnets (multi-chain) ────────────────────────────────────────────────
    ethereum: {
      url: process.env.ETHEREUM_RPC_URL || "https://cloudflare-eth.com",
      accounts: PRIVATE_KEY,
      chainId: 1,
    },
    polygon: {
      url: process.env.POLYGON_RPC_URL || "https://polygon-rpc.com",
      accounts: PRIVATE_KEY,
      chainId: 137,
    },
    bsc: {
      url: process.env.BSC_RPC_URL || "https://bsc-dataseed.binance.org",
      accounts: PRIVATE_KEY,
      chainId: 56,
    },
    arbitrum: {
      url: process.env.ARBITRUM_RPC_URL || "https://arb1.arbitrum.io/rpc",
      accounts: PRIVATE_KEY,
      chainId: 42161,
    },
  },
  etherscan: {
    apiKey: {
      mainnet:        process.env.ETHERSCAN_API_KEY || "",
      sepolia:        process.env.ETHERSCAN_API_KEY || "",
      polygon:        process.env.POLYGONSCAN_API_KEY || "",
      polygonMumbai:  process.env.POLYGONSCAN_API_KEY || "",
      bsc:            process.env.BSCSCAN_API_KEY || "",
      arbitrumOne:    process.env.ARBISCAN_API_KEY || "",
    },
  },
  sourcify: {
    enabled: true,
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
    outputFile: "gas-report.txt",
    noColors: true,
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
