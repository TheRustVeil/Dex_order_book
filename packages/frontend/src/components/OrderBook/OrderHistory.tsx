'use client'
import { useState, useEffect, useCallback } from 'react'
import { useDexStore } from '@/store/dex'
import type { Order } from '@/types'
import { API_URL } from '@/lib/api'
import clsx from 'clsx'

const STATUS_COLOR: Record<string, string> = {
  filled:    'text-green-400',
  cancelled: 'text-red-400',
  partial:   'text-yellow-400',
  open:      'text-blue-400',
}

export function OrderHistory() {
  const { wallet } = useDexStore()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage]     = useState(0)
  const PAGE_SIZE = 20

  const trader = wallet ?? 'anon'

  const fetchHistory = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/orders/history?trader=${trader}&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`)
      const data = await res.json()
      if (data.success) setOrders(data.orders ?? [])
    } catch {}
    finally { setLoading(false) }
  }, [trader, page])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Order History</span>
        <button
          onClick={fetchHistory}
          disabled={loading}
          className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {orders.length === 0 ? (
        <div className="text-xs text-gray-500 text-center py-6">No order history</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-border">
                  <th className="text-left py-1.5 pr-2">Side</th>
                  <th className="text-right pr-2">Price</th>
                  <th className="text-right pr-2">Qty</th>
                  <th className="text-right pr-2">Filled</th>
                  <th className="text-center pr-2">Status</th>
                  <th className="text-right">Time</th>
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
                    <td className="text-right font-mono pr-2 text-gray-300">{o.filled.toFixed(4)}</td>
                    <td className="text-center pr-2">
                      <span className={clsx('capitalize', STATUS_COLOR[o.status] ?? 'text-gray-400')}>
                        {o.status}
                      </span>
                    </td>
                    <td className="text-right text-gray-500">
                      {new Date(o.timestamp).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between pt-1">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
              className="text-[10px] text-gray-500 hover:text-gray-300 disabled:opacity-30 transition-colors"
            >
              ← Prev
            </button>
            <span className="text-[10px] text-gray-600">Page {page + 1}</span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={orders.length < PAGE_SIZE || loading}
              className="text-[10px] text-gray-500 hover:text-gray-300 disabled:opacity-30 transition-colors"
            >
              Next →
            </button>
          </div>
        </>
      )}
    </div>
  )
}
