'use client'
import { useState } from 'react'
import { useDexStore } from '@/store/dex'
import { API_URL } from '@/lib/api'

export function AMMPanel() {
  const { ammPool } = useDexStore()
  const [amountIn, setAmountIn] = useState('')
  const [tokenIn, setTokenIn] = useState<'A' | 'B'>('A')
  const [quote, setQuote] = useState<{ amountOut: number; priceImpact: number; effectivePrice: number; fee: number } | null>(null)
  const [swapping, setSwapping] = useState(false)
  const [swapResult, setSwapResult] = useState<string | null>(null)

  async function getQuote() {
    if (!amountIn || +amountIn <= 0) return
    try {
      const res = await fetch(`${API_URL}/amm/swap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountIn: +amountIn, tokenIn, dryRun: true }),
      })
      const data = await res.json()
      if (data.success) setQuote(data.quote)
    } catch {}
  }

  async function executeSwap() {
    if (!amountIn || +amountIn <= 0) return
    setSwapping(true)
    setSwapResult(null)
    try {
      const res = await fetch(`${API_URL}/amm/swap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountIn: +amountIn, tokenIn }),
      })
      const data = await res.json()
      if (data.success) {
        const r = data.result
        setSwapResult(`Swapped ${amountIn} ${tokenIn === 'A' ? 'ETH' : 'USDC'} → ${r.amountOut.toFixed(4)} ${tokenIn === 'A' ? 'USDC' : 'ETH'} (impact: ${(r.priceImpact * 100).toFixed(3)}%)`)
        setQuote(null)
        setAmountIn('')
      } else {
        setSwapResult(`Error: ${data.error}`)
      }
    } catch (e) {
      setSwapResult(`Network error: ${e}`)
    } finally {
      setSwapping(false)
    }
  }

  if (!ammPool) return (
    <div className="flex items-center justify-center h-full text-gray-500 text-sm">Connecting…</div>
  )

  const spotPrice = ammPool.reserveB / ammPool.reserveA

  return (
    <div className="space-y-4">
      {/* Pool Stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-bg rounded p-3 border border-border">
          <div className="text-xs text-gray-400 mb-1">ETH Reserve</div>
          <div className="text-sm font-mono text-white">{ammPool.reserveA.toFixed(4)}</div>
        </div>
        <div className="bg-bg rounded p-3 border border-border">
          <div className="text-xs text-gray-400 mb-1">USDC Reserve</div>
          <div className="text-sm font-mono text-white">{ammPool.reserveB.toFixed(2)}</div>
        </div>
        <div className="bg-bg rounded p-3 border border-border">
          <div className="text-xs text-gray-400 mb-1">Spot Price</div>
          <div className="text-sm font-mono text-accent">${spotPrice.toFixed(2)}</div>
        </div>
        <div className="bg-bg rounded p-3 border border-border">
          <div className="text-xs text-gray-400 mb-1">Fee</div>
          <div className="text-sm font-mono text-white">{(ammPool.fee * 100).toFixed(2)}%</div>
        </div>
      </div>

      {/* Swap */}
      <div className="space-y-2">
        <div className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Swap</div>
        <div className="flex gap-2">
          <button
            onClick={() => setTokenIn('A')}
            className={`flex-1 py-1.5 text-xs rounded border transition-colors ${tokenIn === 'A' ? 'border-accent text-accent bg-accent/10' : 'border-border text-gray-500'}`}
          >
            ETH → USDC
          </button>
          <button
            onClick={() => setTokenIn('B')}
            className={`flex-1 py-1.5 text-xs rounded border transition-colors ${tokenIn === 'B' ? 'border-accent text-accent bg-accent/10' : 'border-border text-gray-500'}`}
          >
            USDC → ETH
          </button>
        </div>
        <input
          type="number"
          step="0.0001"
          min="0"
          value={amountIn}
          onChange={e => { setAmountIn(e.target.value); setQuote(null) }}
          placeholder={`Amount in ${tokenIn === 'A' ? 'ETH' : 'USDC'}`}
          className="w-full bg-bg border border-border rounded px-3 py-2 text-sm text-white font-mono placeholder-gray-600 focus:outline-none focus:border-accent"
        />
        {quote && (
          <div className="bg-bg rounded p-2 border border-border text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-400">Out</span>
              <span className="text-white font-mono">{quote.amountOut.toFixed(4)} {tokenIn === 'A' ? 'USDC' : 'ETH'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Price Impact</span>
              <span className={quote.priceImpact > 0.01 ? 'text-red-400' : 'text-green-400'}>
                {(quote.priceImpact * 100).toFixed(3)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Effective Price</span>
              <span className="text-white font-mono">${quote.effectivePrice.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Fee</span>
              <span className="text-gray-300 font-mono">{quote.fee.toFixed(4)}</span>
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <button
            onClick={getQuote}
            disabled={!amountIn || +amountIn <= 0}
            className="flex-1 py-2 text-xs rounded border border-accent text-accent hover:bg-accent/10 transition-colors disabled:opacity-40"
          >
            Get Quote
          </button>
          <button
            onClick={executeSwap}
            disabled={swapping || !amountIn || +amountIn <= 0}
            className="flex-1 py-2 text-xs rounded bg-accent text-white hover:bg-blue-500 transition-colors disabled:opacity-40"
          >
            {swapping ? 'Swapping…' : 'Swap'}
          </button>
        </div>
        {swapResult && (
          <div className="text-xs text-gray-300 bg-bg border border-border rounded px-3 py-2 break-words">
            {swapResult}
          </div>
        )}
      </div>
    </div>
  )
}
