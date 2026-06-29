'use client'
import { useDexStore } from '@/store/dex'
import { Trade } from '@/types'

export function TradeHistory() {
  const { trades } = useDexStore()

  if (!trades.length) return (
    <div className="flex items-center justify-center h-full text-gray-500 text-sm">No trades yet…</div>
  )

  const recent = [...trades].reverse().slice(0, 50)

  return (
    <div className="overflow-auto h-full">
      <table className="w-full text-xs font-mono">
        <thead className="sticky top-0 bg-card">
          <tr className="text-gray-500 border-b border-border">
            <th className="text-left px-2 py-1.5 font-normal">Time</th>
            <th className="text-right px-2 py-1.5 font-normal">Price</th>
            <th className="text-right px-2 py-1.5 font-normal">Size</th>
            <th className="text-right px-2 py-1.5 font-normal">Side</th>
          </tr>
        </thead>
        <tbody>
          {recent.map((t: Trade) => (
            <tr key={t.id} className="border-b border-border/30 hover:bg-white/5">
              <td className="px-2 py-1 text-gray-500">
                {new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </td>
              <td className={`px-2 py-1 text-right tabular-nums ${t.side === 'buy' ? 'text-green-400' : 'text-red-400'}`}>
                {t.price.toFixed(2)}
              </td>
              <td className="px-2 py-1 text-right text-gray-300 tabular-nums">
                {t.quantity.toFixed(4)}
              </td>
              <td className={`px-2 py-1 text-right font-semibold ${t.side === 'buy' ? 'text-green-400' : 'text-red-400'}`}>
                {t.side === 'buy' ? 'B' : 'S'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
