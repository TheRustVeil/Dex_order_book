'use client'
import { useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { useDexStore } from '@/store/dex'

export function DepthChart() {
  const { snapshot } = useDexStore()

  const data = useMemo(() => {
    if (!snapshot) return []

    // Build cumulative bid depth (descending price → cumulative qty)
    const bidLevels = [...snapshot.bids]
    const askLevels = [...snapshot.asks]

    const bids: { price: number; bidDepth: number; askDepth: number | undefined }[] = []
    let cumBid = 0
    for (let i = bidLevels.length - 1; i >= 0; i--) {
      cumBid += bidLevels[i].quantity
      bids.unshift({ price: bidLevels[i].price, bidDepth: cumBid, askDepth: undefined })
    }

    const asks: { price: number; bidDepth: number | undefined; askDepth: number }[] = []
    let cumAsk = 0
    for (const l of askLevels) {
      cumAsk += l.quantity
      asks.push({ price: l.price, bidDepth: undefined, askDepth: cumAsk })
    }

    return [...bids, ...asks]
  }, [snapshot])

  if (!data.length) return (
    <div className="flex items-center justify-center h-full text-gray-500 text-sm">Connecting…</div>
  )

  const midPrice = snapshot?.lastPrice ?? 0

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 4, right: 16, bottom: 0, left: 16 }}>
        <defs>
          <linearGradient id="bidGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#16a34a" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#16a34a" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="askGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#dc2626" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#dc2626" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="price"
          tickFormatter={v => `$${Number(v).toFixed(0)}`}
          tick={{ fill: '#6b7280', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={v => `${Number(v).toFixed(1)}`}
          tick={{ fill: '#6b7280', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          width={40}
        />
        <Tooltip
          contentStyle={{ background: '#1a1f2e', border: '1px solid #2d3748', borderRadius: 4, fontSize: 11 }}
          labelFormatter={v => `$${Number(v).toFixed(2)}`}
          formatter={(v, name) => [`${Number(v).toFixed(4)} ETH`, name === 'bidDepth' ? 'Bid Depth' : 'Ask Depth']}
          labelStyle={{ color: '#9ca3af' }}
        />
        {midPrice > 0 && (
          <ReferenceLine x={midPrice} stroke="#4b5563" strokeDasharray="3 3" />
        )}
        <Area
          type="stepAfter"
          dataKey="bidDepth"
          stroke="#16a34a"
          strokeWidth={1.5}
          fill="url(#bidGrad)"
          dot={false}
          connectNulls={false}
        />
        <Area
          type="stepAfter"
          dataKey="askDepth"
          stroke="#dc2626"
          strokeWidth={1.5}
          fill="url(#askGrad)"
          dot={false}
          connectNulls={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
