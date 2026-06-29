import { NextRequest, NextResponse } from 'next/server'
import { sim } from '@/lib/engine/simulation'
import { LPPosition } from '@/types'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const { position } = await req.json() as { position: LPPosition }
    if (!position) return NextResponse.json({ error: 'Missing position' }, { status: 400 })

    const ilResult = sim.amm.calcImpermanentLoss(position)
    const ilCurve = sim.amm.getILCurve()
    return NextResponse.json({ success: true, ilResult, ilCurve })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
