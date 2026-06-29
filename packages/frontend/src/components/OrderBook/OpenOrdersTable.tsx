'use client'
import { useState, useEffect, useCallback } from 'react'
import { useDexStore } from '@/store/dex'
import type { Order } from '@/types'
import { API_URL } from '@/lib/api'
import clsx from 'clsx'

export function OpenOrdersTable() {
  const { wallet } = useDexStore()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)
  const [cancelling, setCancelling] = useState<string | null>(null)

  const trader = wallet ?? 'anon'

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/orders?trader=${trader}&status=open`)
      const data = await res.json()
      if (data.success) setOrders(data.orders ?? [])
    } catch {}
    finally { setLoading(false) }
  }, [trader])

  useEffect(() => {
    fetchOrders()
    const id = setInterval(fetchOrders, 3_000)
    return () => clearInterval(id)
  }, [fetchOrders])

  async function cancel(orderId: string) {
    setCancelling(orderId)
    try {
      const res = await fetch(`${API_URL}/orders/${orderId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trader }),
      })
      const data = await res.json()
      if (data.success) setOrders(prev => prev.filter(o => o.id !== orderId))
    } catch {}
    finally { setCancelling(null) }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Open Orders</span>
        <button
          onClick={fetchOrders}
          disabled={loading}
          className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {orders.length === 0 ? (
        <div className="text-xs text-gray-500 text-center py-6">No open orders</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-border">
                <th className="text-left py-1.5 pr-2">Side</th>
                <th className="text-right pr-2">Price</th>
                <th className="text-right pr-2">Qty</th>
                <th className="text-right pr-2">Filled</th>
                <th className="text-center pr-2">Type</th>
                <th className="text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {orders.map(o => (
                <tr key={o.id} className="hover:bg-white/5 transition-colors">
                  <td className="py-1.5 pr-2">
                    <span className={clsx('font-semibold', o.side === 'buy' ? 'text-green-400' : 'text-red-400')}>
                      {o.side.toUpperCase()}
                    </span>
                  </td>
                  <td className="text-right font-mono pr-2">
                    {o.type === 'market'
                      ? <span className="text-gray-500">MKT</span>
                      : <span className="text-white">{o.price.toFixed(2)}</span>
                    }
                  </td>
                  <td className="text-right font-mono pr-2 text-white">{o.quantity.toFixed(4)}</td>
                  <td className="text-right font-mono pr-2">
                    <span className={o.filled > 0 ? 'text-yellow-400' : 'text-gray-500'}>
                      {o.filled.toFixed(4)}
                    </span>
                  </td>
                  <td className="text-center pr-2 text-gray-400 capitalize">{o.type}</td>
                  <td className="text-center">
                    <button
                      onClick={() => cancel(o.id)}
                      disabled={cancelling === o.id}
                      className="text-[10px] text-red-400 border border-red-400/40 rounded px-2 py-0.5 hover:bg-red-400/10 transition-colors disabled:opacity-40"
                    >
                      {cancelling === o.id ? '…' : 'Cancel'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
