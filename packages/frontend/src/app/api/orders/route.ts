import { NextRequest, NextResponse } from 'next/server'
import { sim } from '@/lib/engine/simulation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const trader = searchParams.get('trader')
    const status = searchParams.get('status') ?? undefined

    if (!trader) {
      return NextResponse.json({ success: false, error: 'trader required' }, { status: 400 })
    }

    const orders = sim.ob.getTraderOrders(trader, status)
    return NextResponse.json({ success: true, orders })
  } catch (e) {
    console.error('[/api/orders] ERROR:', e)
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}
