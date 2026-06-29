// Contract addresses from environment (populated after deployment)
export const CONTRACT_ADDRESSES = {
  orderBook:     process.env.NEXT_PUBLIC_ORDERBOOK_CONTRACT as string | undefined,
  settlement:    process.env.NEXT_PUBLIC_SETTLEMENT_CONTRACT as string | undefined,
  tokenRegistry: process.env.NEXT_PUBLIC_TOKEN_REGISTRY_CONTRACT as string | undefined,
  factory:       process.env.NEXT_PUBLIC_FACTORY_CONTRACT as string | undefined,
  feeManager:    process.env.NEXT_PUBLIC_FEE_MANAGER_CONTRACT as string | undefined,
}

export const SUPPORTED_CHAIN_IDS: Record<number, string> = {
  1: 'Ethereum Mainnet',
  11155111: 'Sepolia Testnet',
  31337: 'Hardhat Local',
}
