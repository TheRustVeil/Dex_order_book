import { NextRequest, NextResponse } from 'next/server'
import { sim } from '@/lib/engine/simulation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const trader = searchParams.get('trader')
    const limit  = parseInt(searchParams.get('limit') ?? '20')
    const offset = parseInt(searchParams.get('offset') ?? '0')

    if (!trader) {
      return NextResponse.json({ success: false, error: 'trader required' }, { status: 400 })
    }

    const all    = sim.ob.getTraderOrders(trader)
    const sorted = all.sort((a, b) => b.timestamp - a.timestamp)
    const total  = sorted.length
    const orders = sorted.slice(offset, offset + limit)

    return NextResponse.json({ success: true, orders, total, limit, offset })
  } catch (e) {
    console.error('[/api/orders/history] ERROR:', e)
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}
