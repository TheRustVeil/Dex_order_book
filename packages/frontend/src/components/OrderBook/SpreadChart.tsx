'use client'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { useDexStore } from '@/store/dex'

export function SpreadChart() {
  const { spreadHistory } = useDexStore()

  if (!spreadHistory.length) return (
    <div className="flex items-center justify-center h-full text-gray-500 text-sm">Waiting for data…</div>
  )

  const data = spreadHistory.map(d => ({
    time: new Date(d.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    spread: +d.spread.toFixed(4),
    spreadPct: +d.spreadPct.toFixed(4),
    midPrice: +d.midPrice.toFixed(2),
  }))

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 16, bottom: 0, left: 16 }}>
        <XAxis
          dataKey="time"
          tick={{ fill: '#6b7280', fontSize: 9 }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          yAxisId="spread"
          tickFormatter={v => `$${v}`}
          tick={{ fill: '#6b7280', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          width={50}
        />
        <YAxis
          yAxisId="pct"
          orientation="right"
          tickFormatter={v => `${v}%`}
          tick={{ fill: '#6b7280', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          width={45}
        />
        <Tooltip
          contentStyle={{ background: '#1a1f2e', border: '1px solid #2d3748', borderRadius: 4, fontSize: 11 }}
          labelStyle={{ color: '#9ca3af' }}
          formatter={(v, name) => {
            if (name === 'spread') return [`$${v}`, 'Spread']
            if (name === 'spreadPct') return [`${v}%`, 'Spread %']
            return [v, name]
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
          formatter={(v) => v === 'spread' ? 'Spread (USD)' : 'Spread (%)'}
        />
        <Line
          yAxisId="spread"
          type="monotone"
          dataKey="spread"
          stroke="#f59e0b"
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
        <Line
          yAxisId="pct"
          type="monotone"
          dataKey="spreadPct"
          stroke="#8b5cf6"
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
