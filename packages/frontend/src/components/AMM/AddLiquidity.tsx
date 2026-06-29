'use client'
import { useState } from 'react'
import { useDexStore } from '@/store/dex'
import { API_URL } from '@/lib/api'

export function AddLiquidity() {
  const { ammPool, setLpPosition } = useDexStore()
  const [amountA, setAmountA] = useState('')
  const [amountB, setAmountB] = useState('')
  const [slippage, setSlippage] = useState('0.5') // %
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState<string | null>(null)

  // Auto-fill the paired token amount based on current pool ratio
  function onAmountAChange(val: string) {
    setAmountA(val)
    if (ammPool && ammPool.reserveA > 0 && val && +val > 0) {
      const ratio = ammPool.reserveB / ammPool.reserveA
      setAmountB((+val * ratio).toFixed(4))
    }
  }

  function onAmountBChange(val: string) {
    setAmountB(val)
    if (ammPool && ammPool.reserveB > 0 && val && +val > 0) {
      const ratio = ammPool.reserveA / ammPool.reserveB
      setAmountA((+val * ratio).toFixed(4))
    }
  }

  async function addLiquidity() {
    if (!amountA || !amountB || +amountA <= 0 || +amountB <= 0) return
    setLoading(true)
    setResult(null)
    try {
      const slip = +slippage / 100
      const res = await fetch(`${API_URL}/amm/liquidity/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountA:   +amountA,
          amountB:   +amountB,
          amountAMin: +amountA * (1 - slip),
          amountBMin: +amountB * (1 - slip),
        }),
      })
      const data = await res.json()
      if (data.success) {
        const { lpMinted, amountA: a, amountB: b } = data
        setResult(`Added ${a.toFixed(4)} ETH + ${b.toFixed(2)} USDC → received ${lpMinted.toFixed(6)} LP`)
        if (data.position) setLpPosition(data.position)
        setAmountA('')
        setAmountB('')
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

  const spotPrice = ammPool.reserveA > 0 ? ammPool.reserveB / ammPool.reserveA : 0

  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Add Liquidity</div>

      {/* ETH amount */}
      <div>
        <label className="text-xs text-gray-500 block mb-1">ETH Amount</label>
        <input
          type="number"
          step="0.0001"
          min="0"
          value={amountA}
          onChange={e => onAmountAChange(e.target.value)}
          placeholder="0.0000"
          className="w-full bg-bg border border-border rounded px-3 py-2 text-sm text-white font-mono placeholder-gray-600 focus:outline-none focus:border-accent"
        />
      </div>

      {/* USDC amount */}
      <div>
        <label className="text-xs text-gray-500 block mb-1">
          USDC Amount
          {spotPrice > 0 && amountA && +amountA > 0 && (
            <span className="text-gray-600 ml-2 font-normal">
              ≈ ${(+amountA * spotPrice).toFixed(2)} at spot
            </span>
          )}
        </label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={amountB}
          onChange={e => onAmountBChange(e.target.value)}
          placeholder="0.00"
          className="w-full bg-bg border border-border rounded px-3 py-2 text-sm text-white font-mono placeholder-gray-600 focus:outline-none focus:border-accent"
        />
      </div>

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

      {/* Pool share preview */}
      {amountA && +amountA > 0 && ammPool.reserveA > 0 && (
        <div className="bg-bg rounded p-2 border border-border text-xs space-y-1">
          <div className="flex justify-between text-gray-400">
            <span>Pool share</span>
            <span className="text-white">
              {((+amountA / (ammPool.reserveA + +amountA)) * 100).toFixed(4)}%
            </span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span>Spot price</span>
            <span className="text-white">${spotPrice.toFixed(2)} / ETH</span>
          </div>
        </div>
      )}

      <button
        onClick={addLiquidity}
        disabled={loading || !amountA || !amountB || +amountA <= 0 || +amountB <= 0}
        className="w-full py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors disabled:opacity-40"
      >
        {loading ? 'Adding…' : 'Add Liquidity'}
      </button>

      {result && (
        <div className="text-xs text-gray-300 bg-bg border border-border rounded px-3 py-2 break-words">
          {result}
        </div>
      )}
    </div>
  )
}
