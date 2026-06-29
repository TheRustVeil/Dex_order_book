'use client'
import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { useDexStore } from '@/store/dex'

interface VolumeBar {
  time: string
  buyVolume: number
  sellVolume: number
  totalVolume: number
  rawTime: number
}

const BUCKET_MS = 60_000 // 1-minute buckets

export function VolumeChart() {
  const { trades } = useDexStore()

  const data: VolumeBar[] = useMemo(() => {
    if (!trades.length) return []

    const now    = Date.now()
    const cutoff = now - 60 * BUCKET_MS // last 60 minutes
    const recent = trades.filter(t => t.timestamp >= cutoff)
    if (!recent.length) return []

    const buckets = new Map<number, { buy: number; sell: number }>()

    for (const t of recent) {
      const bucket = Math.floor(t.timestamp / BUCKET_MS) * BUCKET_MS
      const cur    = buckets.get(bucket) ?? { buy: 0, sell: 0 }
      const vol    = t.price * t.quantity
      if (t.side === 'buy')  cur.buy  += vol
      else                   cur.sell += vol
      buckets.set(bucket, cur)
    }

    const sorted = Array.from(buckets.entries()).sort(([a], [b]) => a - b)

    return sorted.map(([ts, v]) => ({
      time:        new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      rawTime:     ts,
      buyVolume:   +v.buy.toFixed(2),
      sellVolume:  +v.sell.toFixed(2),
      totalVolume: +(v.buy + v.sell).toFixed(2),
    }))
  }, [trades])

  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-sm">
        Waiting for trades…
      </div>
    )
  }

  const maxVol = Math.max(...data.map(d => d.totalVolume), 1)

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        margin={{ top: 4, right: 16, bottom: 0, left: 16 }}
        barSize={12}
        barGap={0}
        barCategoryGap="20%"
      >
        <XAxis
          dataKey="time"
          tick={{ fill: '#6b7280', fontSize: 9 }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={v => v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`}
          tick={{ fill: '#6b7280', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          domain={[0, maxVol * 1.1]}
          width={55}
        />
        <Tooltip
          contentStyle={{
            background: '#1a1f2e',
            border: '1px solid #2d3748',
            borderRadius: 4,
            fontSize: 11,
          }}
          labelStyle={{ color: '#9ca3af' }}
          formatter={(value: number, name: string) => {
            const label = name === 'buyVolume' ? 'Buy Vol' : 'Sell Vol'
            return [`$${value.toFixed(2)}`, label]
          }}
        />
        <Bar dataKey="buyVolume"  stackId="vol" fill="#22c55e" radius={[0, 0, 0, 0]} />
        <Bar dataKey="sellVolume" stackId="vol" fill="#ef4444" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
