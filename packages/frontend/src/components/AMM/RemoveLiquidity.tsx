'use client'
import { useState } from 'react'
import { useDexStore } from '@/store/dex'
import { API_URL } from '@/lib/api'

export function RemoveLiquidity() {
  const { ammPool, lpPosition, setLpPosition } = useDexStore()
  const [lpAmount, setLpAmount] = useState('')
  const [slippage, setSlippage] = useState('0.5')
  const [loading, setLoading]   = useState(false)
  const [result, setResult]     = useState<string | null>(null)

  const lpBalance = lpPosition?.lpBalance ?? 0
  const pctOptions = [25, 50, 75, 100]

  function setPercent(pct: number) {
    setLpAmount(((lpBalance * pct) / 100).toFixed(6))
  }

  // Preview what you'll receive
  const lpFloat   = +lpAmount || 0
  const totalLp   = lpPosition?.totalSupply ?? 0
  const shareRatio = totalLp > 0 ? lpFloat / totalLp : 0
  const receiveA  = ammPool ? ammPool.reserveA * shareRatio : 0
  const receiveB  = ammPool ? ammPool.reserveB * shareRatio : 0

  async function removeLiquidity() {
    if (!lpAmount || lpFloat <= 0) return
    setLoading(true)
    setResult(null)
    try {
      const slip = +slippage / 100
      const res = await fetch(`${API_URL}/amm/liquidity/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lpAmount:   lpFloat,
          amountAMin: receiveA * (1 - slip),
          amountBMin: receiveB * (1 - slip),
        }),
      })
      const data = await res.json()
      if (data.success) {
        const { amountA, amountB } = data
        setResult(`Removed ${lpFloat.toFixed(6)} LP → ${amountA.toFixed(4)} ETH + ${amountB.toFixed(2)} USDC`)
        if (data.position) setLpPosition(data.position)
        setLpAmount('')
      } else {
        setResult(`Error: ${data.error}`)
      }
    } catch (e) {
      setResult(`Network error: ${e}`)
    } finally {
      setLoading(false)
    }
  }

  if (!ammPool) return null

  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Remove Liquidity</div>

      {/* LP Balance display */}
      <div className="bg-bg rounded p-2 border border-border text-xs flex justify-between items-center">
        <span className="text-gray-500">Your LP Balance</span>
        <span className="text-white font-mono">{lpBalance.toFixed(6)} ZLP</span>
      </div>

      {/* Amount input */}
      <div>
        <label className="text-xs text-gray-500 block mb-1">LP Amount to Remove</label>
        <input
          type="number"
          step="0.000001"
          min="0"
          max={lpBalance}
          value={lpAmount}
          onChange={e => setLpAmount(e.target.value)}
          placeholder="0.000000"
          className="w-full bg-bg border border-border rounded px-3 py-2 text-sm text-white font-mono placeholder-gray-600 focus:outline-none focus:border-accent"
        />
        <div className="flex gap-1 mt-1">
          {pctOptions.map(pct => (
            <button
              key={pct}
              type="button"
              onClick={() => setPercent(pct)}
              disabled={lpBalance <= 0}
              className="text-[10px] text-gray-400 border border-border rounded px-1.5 py-0.5 hover:border-gray-500 disabled:opacity-30"
            >
              {pct}%
            </button>
          ))}
        </div>
      </div>

      {/* Receive preview */}
      {lpFloat > 0 && (
        <div className="bg-bg rounded p-2 border border-border text-xs space-y-1">
          <div className="text-gray-500 mb-1">You will receive (estimated):</div>
          <div className="flex justify-between">
            <span className="text-gray-400">ETH</span>
            <span className="text-white font-mono">{receiveA.toFixed(6)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">USDC</span>
            <span className="text-white font-mono">{receiveB.toFixed(2)}</span>
          </div>
          <div className="flex justify-between border-t border-border/50 pt-1">
            <span className="text-gray-500">Pool share</span>
            <span className="text-gray-300">{(shareRatio * 100).toFixed(4)}%</span>
          </div>
        </div>
      )}

      {/* Slippage */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">Slippage:</span>
        {['0.1', '0.5', '1.0'].map(v => (
          <button
            key={v}
            type="button"
            onClick={() => setSlippage(v)}
            className={`text-[10px] rounded px-2 py-0.5 border transition-colors ${
              slippage === v ? 'border-accent text-accent bg-accent/10' : 'border-border text-gray-500'
            }`}
          >
            {v}%
          </button>
        ))}
      </div>

      <button
        onClick={removeLiquidity}
        disabled={loading || lpFloat <= 0 || lpFloat > lpBalance}
        className="w-full py-2 rounded bg-red-700 hover:bg-red-600 text-white text-sm font-semibold transition-colors disabled:opacity-40"
      >
        {loading ? 'Removing…' : 'Remove Liquidity'}
      </button>

      {result && (
        <div className="text-xs text-gray-300 bg-bg border border-border rounded px-3 py-2 break-words">
          {result}
        </div>
      )}
    </div>
  )
}
