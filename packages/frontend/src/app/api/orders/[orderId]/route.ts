import { NextRequest, NextResponse } from 'next/server'
import { sim } from '@/lib/engine/simulation'

export const runtime = 'nodejs'

export async function DELETE(
  req: NextRequest,
  { params }: { params: { orderId: string } }
) {
  const { orderId } = params
  const { trader } = await req.json()

  const orders = sim.ob.getTraderOrders(trader)
  const order  = orders.find(o => o.id === orderId)

  if (!order) {
    return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 })
  }

  const ok = sim.ob.cancelOrder(orderId)
  return NextResponse.json({ success: ok })
}
