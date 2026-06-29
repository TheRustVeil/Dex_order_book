'use client'
import { useDexStore } from '@/store/dex'
import { PriceLevel } from '@/types'

function Row({ level, side, maxQty }: { level: PriceLevel; side: 'bid' | 'ask'; maxQty: number }) {
  const pct = (level.quantity / maxQty) * 100
  const color = side === 'bid' ? 'bg-green-900/40' : 'bg-red-900/40'
  const textColor = side === 'bid' ? 'text-green-400' : 'text-red-400'
  const barSide = side === 'bid' ? 'right-0' : 'left-0'

  return (
    <div className="relative flex justify-between px-3 py-[3px] text-xs font-mono hover:bg-white/5 cursor-default">
      <div className={`absolute top-0 ${barSide} h-full ${color}`} style={{ width: `${pct}%` }} />
      <span className={`relative z-10 ${textColor} tabular-nums`}>{level.price.toFixed(2)}</span>
      <span className="relative z-10 text-gray-300 tabular-nums">{level.quantity.toFixed(4)}</span>
      <span className="relative z-10 text-gray-500 tabular-nums">{level.orderCount}</span>
    </div>
  )
}

export function OrderBookPanel() {
  const { snapshot } = useDexStore()

  if (!snapshot) return (
    <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">Connecting…</div>
  )

  const { bids, asks, lastPrice, spread, spreadPct } = snapshot
  const maxQty = Math.max(
    ...bids.map(b => b.quantity),
    ...asks.map(a => a.quantity),
    1
  )

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between px-3 py-1 text-[11px] text-gray-500 border-b border-border">
        <span>Price (USDC)</span>
        <span>Size (ETH)</span>
        <span>Orders</span>
      </div>

      {/* Asks — reversed so lowest ask is closest to spread */}
      <div className="flex flex-col-reverse flex-1 overflow-hidden">
        {asks.map(l => <Row key={l.price} level={l} side="ask" maxQty={maxQty} />)}
      </div>

      {/* Spread */}
      <div className="flex items-center justify-between px-3 py-2 border-y border-border bg-card">
        <span className="text-lg font-bold font-mono text-white">
          {lastPrice > 0 ? lastPrice.toFixed(2) : '—'}
        </span>
        <span className="text-xs text-gray-400">
          Spread: <span className="text-yellow-400">{spread.toFixed(2)}</span>
          {' '}(<span className="text-yellow-400">{spreadPct.toFixed(3)}%</span>)
        </span>
      </div>

      {/* Bids */}
      <div className="flex-1 overflow-hidden">
        {bids.map(l => <Row key={l.price} level={l} side="bid" maxQty={maxQty} />)}
      </div>
    </div>
  )
}
