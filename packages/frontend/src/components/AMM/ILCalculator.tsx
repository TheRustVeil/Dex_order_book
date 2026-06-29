'use client'
import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { useDexStore } from '@/store/dex'
import { LPPosition } from '@/types'
import { API_URL } from '@/lib/api'

export function ILCalculator() {
  const { lpPosition, setLpPosition } = useDexStore()
  const [amountA, setAmountA] = useState('')
  const [amountB, setAmountB] = useState('')
  const [adding, setAdding] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [ilCurve, setIlCurve] = useState<{ priceRatio: number; ilPct: number }[]>([])
  const [ilResult, setIlResult] = useState<{
    currentValueHold: number
    currentValueLP: number
    impermanentLoss: number
    impermanentLossPct: number
    priceRatio: number
  } | null>(null)

  async function addLiquidity() {
    if (!amountA || !amountB || +amountA <= 0 || +amountB <= 0) return
    setAdding(true)
    setResult(null)
    try {
      const res = await fetch(`${API_URL}/amm/liquidity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountA: +amountA, amountB: +amountB }),
      })
      const data = await res.json()
      if (data.success) {
        setLpPosition(data.position as LPPosition)
        setIlCurve(data.ilCurve ?? [])
        setResult(`Added liquidity: ${data.actualAmountA.toFixed(4)} ETH + ${data.actualAmountB.toFixed(2)} USDC → ${data.sharesIssued.toFixed(4)} shares`)
        setAmountA('')
        setAmountB('')
      } else {
        setResult(`Error: ${data.error}`)
      }
    } catch (e) {
      setResult(`Network error: ${e}`)
    } finally {
      setAdding(false)
    }
  }

  async function calcIL() {
    if (!lpPosition) return
    try {
      const res = await fetch(`${API_URL}/amm/il`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: lpPosition }),
      })
      const data = await res.json()
      if (data.ilResult) setIlResult(data.ilResult)
      if (data.ilCurve) setIlCurve(data.ilCurve)
    } catch {}
  }

  const chartData = ilCurve.map(d => ({
    ratio: d.priceRatio.toFixed(2),
    il: +(d.ilPct * 100).toFixed(3),
  }))

  return (
    <div className="space-y-4">
      {/* Add Liquidity */}
      <div className="space-y-2">
        <div className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Add Liquidity</div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-[10px] text-gray-500 block mb-1">ETH Amount</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amountA}
              onChange={e => setAmountA(e.target.value)}
              placeholder="1.0"
              className="w-full bg-bg border border-border rounded px-2 py-1.5 text-sm text-white font-mono placeholder-gray-600 focus:outline-none focus:border-accent"
            />
          </div>
          <div className="flex-1">
            <label className="text-[10px] text-gray-500 block mb-1">USDC Amount</label>
            <input
              type="number"
              step="1"
              min="0"
              value={amountB}
              onChange={e => setAmountB(e.target.value)}
              placeholder="2000"
              className="w-full bg-bg border border-border rounded px-2 py-1.5 text-sm text-white font-mono placeholder-gray-600 focus:outline-none focus:border-accent"
            />
          </div>
        </div>
        <button
          onClick={addLiquidity}
          disabled={adding || !amountA || !amountB}
          className="w-full py-2 text-xs rounded bg-accent text-white hover:bg-blue-500 transition-colors disabled:opacity-40"
        >
          {adding ? 'Adding…' : 'Add Liquidity'}
        </button>
        {result && (
          <div className="text-xs text-gray-300 bg-bg border border-border rounded px-3 py-2">{result}</div>
        )}
      </div>

      {/* LP Position */}
      {lpPosition && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Your LP Position</div>
            <button onClick={calcIL} className="text-[10px] text-accent hover:underline">Refresh IL</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-bg rounded p-2 border border-border">
              <div className="text-[10px] text-gray-400 mb-0.5">Entry ETH</div>
              <div className="text-xs font-mono text-white">{(lpPosition.entryReserveA ?? 0).toFixed(4)}</div>
            </div>
            <div className="bg-bg rounded p-2 border border-border">
              <div className="text-[10px] text-gray-400 mb-0.5">Entry Price</div>
              <div className="text-xs font-mono text-accent">${(lpPosition.entryPriceAinB ?? 0).toFixed(2)}</div>
            </div>
          </div>
          {ilResult && (
            <div className="bg-bg rounded p-3 border border-border space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">HODL Value</span>
                <span className="font-mono text-white">${ilResult.currentValueHold.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">LP Value</span>
                <span className="font-mono text-white">${ilResult.currentValueLP.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Impermanent Loss</span>
                <span className={`font-mono ${ilResult.impermanentLossPct < -1 ? 'text-red-400' : 'text-yellow-400'}`}>
                  {(ilResult.impermanentLossPct).toFixed(3)}%
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Price Ratio</span>
                <span className="font-mono text-gray-300">{ilResult.priceRatio.toFixed(4)}x</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* IL Curve */}
      {chartData.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs text-gray-400 font-semibold uppercase tracking-wide">IL Curve (0.1x–10x)</div>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <XAxis
                  dataKey="ratio"
                  tick={{ fill: '#6b7280', fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                  interval={Math.floor(chartData.length / 5)}
                />
                <YAxis
                  tickFormatter={v => `${v}%`}
                  tick={{ fill: '#6b7280', fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                />
                <Tooltip
                  contentStyle={{ background: '#1a1f2e', border: '1px solid #2d3748', borderRadius: 4, fontSize: 11 }}
                  formatter={(v) => [`${v}%`, 'IL']}
                  labelFormatter={v => `Price ratio: ${v}x`}
                  labelStyle={{ color: '#9ca3af' }}
                />
                <ReferenceLine y={0} stroke="#4b5563" strokeDasharray="3 3" />
                <ReferenceLine x="1.00" stroke="#4b5563" strokeDasharray="3 3" />
                <Line
                  type="monotone"
                  dataKey="il"
                  stroke="#f59e0b"
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}
