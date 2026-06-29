import { NextRequest, NextResponse } from 'next/server'
import { sim } from '@/lib/engine/simulation'
import { OrderSide, OrderType } from '@/types'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { side, type, price, quantity, trader = 'user' } = body as {
      side: OrderSide
      type: OrderType
      price: number
      quantity: number
      trader?: string
    }

    if (!side || !type || quantity <= 0) {
      return NextResponse.json({ error: 'Invalid order params' }, { status: 400 })
    }
    if (type === 'limit' && (!price || price <= 0)) {
      return NextResponse.json({ error: 'Limit order requires a price' }, { status: 400 })
    }

    const result = sim.ob.placeOrder(side, type, price ?? 0, quantity, trader)
    const order = result.order

    // Hybrid routing: market orders that aren't fully filled by the CLOB
    // get their remainder routed to the AMM pool.
    let ammFill: {
      ethQty: number
      amountOut: number
      priceImpact: number
      newSpotPrice: number
      tokenIn: 'A' | 'B'
    } | null = null

    if (type === 'market' && order.filled < order.quantity) {
      const unfilled = +(order.quantity - order.filled).toFixed(8)
      try {
        const spotPrice = sim.amm.getSpotPrice()
        if (side === 'buy') {
          // Spend USDC to get unfilled ETH from AMM
          const usdcIn = +(unfilled * spotPrice).toFixed(8)
          const swap = sim.amm.executeSwap(usdcIn, 'B')
          ammFill = { ethQty: swap.amountOut, amountOut: swap.amountOut, priceImpact: swap.priceImpact, newSpotPrice: swap.newSpotPrice, tokenIn: 'B' }
        } else {
          // Sell unfilled ETH into AMM for USDC
          const swap = sim.amm.executeSwap(unfilled, 'A')
          ammFill = { ethQty: unfilled, amountOut: swap.amountOut, priceImpact: swap.priceImpact, newSpotPrice: swap.newSpotPrice, tokenIn: 'A' }
        }
      } catch {
        // AMM can fail (empty pool, math overflow) — just skip fallback
      }
    }

    return NextResponse.json({ success: true, order, trades: result.trades, ammFill })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json()
    const ok = sim.ob.cancelOrder(id)
    return NextResponse.json({ success: ok })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
