import { AMMPool, LPPosition, ILResult } from '../types/index.js'

export class AMMEngine {
  private pool: AMMPool

  constructor(
    tokenA = 'ETH',
    tokenB = 'USDC',
    initialReserveA = 100,
    initialReserveB = 200000,
    fee = 0.003
  ) {
    this.pool = {
      tokenA,
      tokenB,
      reserveA: initialReserveA,
      reserveB: initialReserveB,
      k: initialReserveA * initialReserveB,
      fee,
      totalLiquidity: Math.sqrt(initialReserveA * initialReserveB),
    }
  }

  getPool(): AMMPool { return { ...this.pool } }

  getSpotPrice(): number { return this.pool.reserveB / this.pool.reserveA }

  quoteSwap(amountIn: number, tokenIn: 'A' | 'B'): {
    amountOut: number; priceImpact: number; effectivePrice: number; fee: number
  } {
    const { reserveA, reserveB, fee } = this.pool
    const amountInWithFee = amountIn * (1 - fee)
    const feeAmount = amountIn * fee

    let amountOut: number
    let spotBefore: number
    let effectivePrice: number

    if (tokenIn === 'A') {
      spotBefore = reserveB / reserveA
      amountOut = (reserveB * amountInWithFee) / (reserveA + amountInWithFee)
      effectivePrice = amountOut / amountIn
    } else {
      spotBefore = reserveA / reserveB
      amountOut = (reserveA * amountInWithFee) / (reserveB + amountInWithFee)
      effectivePrice = amountOut / amountIn
    }

    const spotAfter = tokenIn === 'A'
      ? (reserveB - amountOut) / (reserveA + amountIn)
      : (reserveA - amountOut) / (reserveB + amountIn)

    const priceImpact = Math.abs((spotAfter - spotBefore) / spotBefore) * 100

    return { amountOut, priceImpact, effectivePrice, fee: feeAmount }
  }

  executeSwap(amountIn: number, tokenIn: 'A' | 'B'): {
    amountOut: number; priceImpact: number; newSpotPrice: number; fee: number
  } {
    const { amountOut, priceImpact, fee } = this.quoteSwap(amountIn, tokenIn)

    if (tokenIn === 'A') {
      this.pool.reserveA += amountIn
      this.pool.reserveB -= amountOut
      this.pool.reserveA += fee
    } else {
      this.pool.reserveB += amountIn
      this.pool.reserveA -= amountOut
      this.pool.reserveB += fee
    }

    this.pool.k = this.pool.reserveA * this.pool.reserveB

    return { amountOut, priceImpact, newSpotPrice: this.getSpotPrice(), fee }
  }

  addLiquidity(amountA: number, amountB: number): {
    sharesIssued: number; actualAmountA: number; actualAmountB: number; position: LPPosition
  } {
    const { reserveA, reserveB, totalLiquidity } = this.pool

    let actualAmountA = amountA
    let actualAmountB = amountB

    if (reserveA > 0 && reserveB > 0) {
      const ratio = reserveB / reserveA
      actualAmountB = amountA * ratio
      if (actualAmountB > amountB) {
        actualAmountA = amountB / ratio
        actualAmountB = amountB
      }
    }

    const sharesIssued = totalLiquidity === 0
      ? Math.sqrt(actualAmountA * actualAmountB)
      : (actualAmountA / reserveA) * totalLiquidity

    this.pool.reserveA += actualAmountA
    this.pool.reserveB += actualAmountB
    this.pool.totalLiquidity += sharesIssued
    this.pool.k = this.pool.reserveA * this.pool.reserveB

    const position: LPPosition = {
      shares: sharesIssued,
      entryReserveA: actualAmountA,
      entryReserveB: actualAmountB,
      entryPriceAinB: actualAmountB / actualAmountA,
    }

    return { sharesIssued, actualAmountA, actualAmountB, position }
  }

  removeLiquidity(shares: number): { amountA: number; amountB: number } {
    const fraction = shares / this.pool.totalLiquidity
    const amountA = fraction * this.pool.reserveA
    const amountB = fraction * this.pool.reserveB

    this.pool.reserveA -= amountA
    this.pool.reserveB -= amountB
    this.pool.totalLiquidity -= shares
    this.pool.k = this.pool.reserveA * this.pool.reserveB

    return { amountA, amountB }
  }

  calcImpermanentLoss(position: LPPosition): ILResult {
    const currentPrice = this.getSpotPrice()
    const priceRatio = currentPrice / position.entryPriceAinB
    const ilFactor = (2 * Math.sqrt(priceRatio)) / (1 + priceRatio) - 1

    const currentValueHold = position.entryReserveA * currentPrice + position.entryReserveB
    const currentValueLP = currentValueHold * (1 + ilFactor)
    const impermanentLoss = currentValueLP - currentValueHold

    return {
      currentValueHold,
      currentValueLP,
      impermanentLoss,
      impermanentLossPct: ilFactor * 100,
      priceRatio,
    }
  }

  getILCurve(points = 50): { priceRatio: number; ilPct: number }[] {
    const result = []
    for (let i = 0; i <= points; i++) {
      const priceRatio = 0.1 + (i / points) * 9.9
      const ilFactor = (2 * Math.sqrt(priceRatio)) / (1 + priceRatio) - 1
      result.push({ priceRatio, ilPct: ilFactor * 100 })
    }
    return result
  }
}
