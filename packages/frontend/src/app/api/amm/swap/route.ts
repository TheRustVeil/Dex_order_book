import { NextRequest, NextResponse } from 'next/server'
import { sim } from '@/lib/engine/simulation'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const { amountIn, tokenIn, dryRun } = await req.json() as { amountIn: number; tokenIn: 'A' | 'B'; dryRun?: boolean }
    if (!amountIn || amountIn <= 0) return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })

    if (dryRun) {
      const quote = sim.amm.quoteSwap(amountIn, tokenIn)
      return NextResponse.json({ success: true, quote })
    }

    const result = sim.amm.executeSwap(amountIn, tokenIn)
    const pool = sim.amm.getPool()
    return NextResponse.json({ success: true, result, pool })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
