import { NextRequest, NextResponse } from 'next/server'
import { sim } from '@/lib/engine/simulation'
import { LPPosition } from '@/types'

export const runtime = 'nodejs'

export async function GET() {
  const curve = sim.amm.getILCurve()
  return NextResponse.json({ ilCurve: curve, pool: sim.amm.getPool() })
}

export async function POST(req: NextRequest) {
  try {
    const { amountA, amountB } = await req.json() as { amountA: number; amountB: number }
    if (!amountA || !amountB || amountA <= 0 || amountB <= 0) {
      return NextResponse.json({ error: 'Invalid amounts' }, { status: 400 })
    }
    const result = sim.amm.addLiquidity(amountA, amountB)
    const curve = sim.amm.getILCurve()
    return NextResponse.json({ success: true, ...result, ilCurve: curve, pool: sim.amm.getPool() })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
