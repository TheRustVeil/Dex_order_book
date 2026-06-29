import { AMMEngine } from '../engine/amm.js'

// ETH/USDC pool: 100 ETH at $2000 each
export const ammService = new AMMEngine('ETH', 'USDC', 100, 200000)

// Per-LP position registry (wallet → latest position)
const lpPositions = new Map<string, {
  shares: number
  entryReserveA: number
  entryReserveB: number
  entryPriceAinB: number
  lpBalance: number
  totalSupply: number
}>()

export function recordLPPosition(wallet: string, shares: number, entryA: number, entryB: number) {
  const existing = lpPositions.get(wallet)
  const totalShares = (existing?.shares ?? 0) + shares
  lpPositions.set(wallet, {
    shares: totalShares,
    entryReserveA: entryA,
    entryReserveB: entryB,
    entryPriceAinB: entryB / entryA,
    lpBalance: totalShares,
    totalSupply: ammService.getPool().totalLiquidity,
  })
}

export function removeLPPosition(wallet: string, shares: number): void {
  const pos = lpPositions.get(wallet)
  if (!pos) return
  const remaining = Math.max(0, pos.shares - shares)
  if (remaining <= 0) {
    lpPositions.delete(wallet)
  } else {
    lpPositions.set(wallet, { ...pos, shares: remaining, lpBalance: remaining, totalSupply: ammService.getPool().totalLiquidity })
  }
}

export function getLPPosition(wallet: string) {
  const pos = lpPositions.get(wallet)
  if (!pos) return null
  return { ...pos, totalSupply: ammService.getPool().totalLiquidity }
}
