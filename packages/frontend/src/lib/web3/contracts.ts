import { BrowserProvider, Contract, parseEther, type Eip1193Provider } from 'ethers'
import { CONTRACT_ADDRESSES } from './config'

// Minimal ABI — only the functions the frontend needs
const SETTLEMENT_ABI = [
  'function settleTrade(address buyer, address seller, address baseToken, address quoteToken, uint256 quantity, uint256 price, uint256 minBaseOut, uint256 minQuoteOut) external',
  'function deposit(address token, uint256 amount) external',
  'function withdraw(address token, uint256 amount) external',
  'function getBalance(address trader, address token) external view returns (uint256)',
  'function feeBps() external view returns (uint256)',
  'event Settled(address indexed buyer, address indexed seller, address indexed baseToken, address quoteToken, uint256 quantity, uint256 price, uint256 fee)',
]

function ethereum(): Eip1193Provider {
  if (!window.ethereum) throw new Error('No wallet detected — install MetaMask')
  return window.ethereum as unknown as Eip1193Provider
}

export function getSigner() {
  const provider = new BrowserProvider(ethereum())
  return provider.getSigner()
}

export async function getSettlementContract(withSigner = false) {
  const addr = CONTRACT_ADDRESSES.settlement
  if (!addr) throw new Error('Settlement contract address not configured')

  if (withSigner) {
    const signer = await getSigner()
    return new Contract(addr, SETTLEMENT_ABI, signer)
  }
  const provider = new BrowserProvider(ethereum())
  return new Contract(addr, SETTLEMENT_ABI, provider)
}

export async function callSettleTrade(
  buyer: string,
  seller: string,
  baseToken: string,
  quoteToken: string,
  quantityEth: number,
  priceUsdc: number,
) {
  const contract = await getSettlementContract(true)
  const quantity = parseEther(quantityEth.toFixed(18).slice(0, 20))
  const price    = parseEther(priceUsdc.toFixed(18).slice(0, 20))
  const tx = await (contract as any).settleTrade(
    buyer, seller, baseToken, quoteToken, quantity, price, BigInt(0), BigInt(0)
  )
  return tx as { hash: string; wait: () => Promise<unknown> }
}
