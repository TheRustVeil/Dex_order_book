'use client'
import { useState } from 'react'
import { useDexStore } from '@/store/dex'
import { OrderSide, OrderType } from '@/types'
import { API_URL } from '@/lib/api'
import { useSettlement, SettlementParams } from '@/hooks/useSettlement'
import clsx from 'clsx'

interface PendingSettle {
  params: SettlementParams
  fillMsg: string
}

export function OrderForm() {
  const [side, setSide] = useState<OrderSide>('buy')
  const [type, setType] = useState<OrderType>('limit')
  const [price, setPrice] = useState('')
  const [qty, setQty] = useState('')
  const [loading, setLoading] = useState(false)
  const [pendingSettle, setPendingSettle] = useState<PendingSettle | null>(null)

  const { snapshot, setLastOrderResult, setLastTxHash, wallet } = useDexStore()
  const { pending: settlePending, txHash, error: settleError, settle, reset } = useSettlement()

  const bestBid = snapshot?.bids[0]?.price ?? 0
  const bestAsk = snapshot?.asks[0]?.price ?? 0

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!qty || +qty <= 0) return

    setLoading(true)
    setPendingSettle(null)
    reset()
    setLastTxHash(null)

    try {
      const res = await fetch(`${API_URL}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          side,
          type,
          price:    type === 'limit' ? +price : 0,
          quantity: +qty,
          trader:   wallet ?? 'anon',
          pairId:   'ETH-USDC',
        }),
      })
      const data = await res.json()
      if (data.success) {
        const o = data.order
        const clobFilled = o.filled.toFixed(4)
        const total = o.quantity.toFixed(4)

        let msg = `${o.id}: ${clobFilled} / ${total} ETH via order book`

        if (data.ammFill) {
          const af = data.ammFill
          if (side === 'buy') {
            msg += ` + ${af.ethQty.toFixed(4)} ETH via AMM (impact: ${af.priceImpact.toFixed(3)}%)`
          } else {
            msg += ` + ${af.amountOut.toFixed(2)} USDC via AMM (impact: ${af.priceImpact.toFixed(3)}%)`
          }
        }

        setLastOrderResult(msg)

        // Offer on-chain settlement if the order was (at least partially) filled
        if (o.filled > 0 && wallet) {
          const effectivePrice = type === 'limit' ? +price : (side === 'buy' ? bestAsk : bestBid)
          setPendingSettle({
            fillMsg: msg,
            params: {
              buyer:    side === 'buy'  ? wallet : 'anon',
              seller:   side === 'sell' ? wallet : 'anon',
              quantity: o.filled,
              price:    effectivePrice || 2000,
              side,
            },
          })
        }
      } else {
        setLastOrderResult(`Error: ${data.error}`)
      }
    } catch (e) {
      setLastOrderResult(`Network error: ${e}`)
    } finally {
      setLoading(false)
    }
  }

  async function handleSettle() {
    if (!pendingSettle) return
    const hash = await settle(pendingSettle.params)
    if (hash) {
      setLastTxHash(hash)
      setLastOrderResult(`${pendingSettle.fillMsg} | tx: ${hash.slice(0, 10)}…`)
      setPendingSettle(null)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {/* Buy / Sell tabs */}
      <div className="flex rounded overflow-hidden border border-border">
        {(['buy', 'sell'] as OrderSide[]).map(s => (
          <button
            key={s}
            type="button"
            onClick={() => setSide(s)}
            className={clsx(
              'flex-1 py-2 text-sm font-semibold transition-colors',
              side === s
                ? s === 'buy' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                : 'bg-card text-gray-400 hover:bg-white/5'
            )}
          >
            {s.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Order type */}
      <div className="flex gap-2">
        {(['limit', 'market'] as OrderType[]).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={clsx(
              'flex-1 py-1.5 text-xs rounded border transition-colors',
              type === t
                ? 'border-accent text-accent bg-accent/10'
                : 'border-border text-gray-500 hover:border-gray-500'
            )}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Price (limit only) */}
      {type === 'limit' && (
        <div>
          <label className="text-xs text-gray-400 block mb-1">Price (USDC)</label>
          <div className="relative">
            <input
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={e => setPrice(e.target.value)}
              placeholder={side === 'buy' ? bestBid.toFixed(2) : bestAsk.toFixed(2)}
              className="w-full bg-bg border border-border rounded px-3 py-2 text-sm text-white font-mono placeholder-gray-600 focus:outline-none focus:border-accent"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
              {side === 'buy' && bestBid > 0 && (
                <button type="button" onClick={() => setPrice(bestBid.toFixed(2))}
                  className="text-[10px] text-green-400 bg-green-900/40 px-1.5 py-0.5 rounded">Bid</button>
              )}
              {side === 'sell' && bestAsk > 0 && (
                <button type="button" onClick={() => setPrice(bestAsk.toFixed(2))}
                  className="text-[10px] text-red-400 bg-red-900/40 px-1.5 py-0.5 rounded">Ask</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quantity */}
      <div>
        <label className="text-xs text-gray-400 block mb-1">Quantity (ETH)</label>
        <input
          type="number"
          step="0.0001"
          min="0"
          value={qty}
          onChange={e => setQty(e.target.value)}
          placeholder="1.0000"
          className="w-full bg-bg border border-border rounded px-3 py-2 text-sm text-white font-mono placeholder-gray-600 focus:outline-none focus:border-accent"
        />
        <div className="flex gap-1 mt-1">
          {[0.1, 0.5, 1, 5].map(v => (
            <button key={v} type="button" onClick={() => setQty(String(v))}
              className="text-[10px] text-gray-400 border border-border rounded px-1.5 py-0.5 hover:border-gray-500">
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Order value */}
      {qty && price && type === 'limit' && (
        <div className="text-xs text-gray-400 bg-bg rounded px-3 py-2 border border-border">
          Total: <span className="text-white font-mono">${(+qty * +price).toFixed(2)}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className={clsx(
          'w-full py-2.5 rounded font-semibold text-sm transition-colors disabled:opacity-50',
          side === 'buy'
            ? 'bg-green-600 hover:bg-green-500 text-white'
            : 'bg-red-600 hover:bg-red-500 text-white'
        )}
      >
        {loading ? 'Placing…' : `Place ${type === 'limit' ? 'Limit' : 'Market'} ${side === 'buy' ? 'Buy' : 'Sell'}`}
      </button>

      {/* ── On-chain settlement CTA ── */}
      {pendingSettle && !txHash && (
        <div className="rounded-lg border border-accent/30 bg-accent/5 p-3 space-y-2">
          <p className="text-[11px] text-accent font-semibold">Order filled off-chain</p>
          <p className="text-[10px] text-gray-400">
            Record this settlement on Sepolia to make it permanent.
          </p>
          {settleError && (
            <p className="text-[10px] text-red-400 truncate" title={settleError}>
              ⚠ {settleError.slice(0, 80)}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSettle}
              disabled={settlePending}
              className="flex-1 py-1.5 rounded text-xs font-semibold bg-accent/20 hover:bg-accent/30 text-accent border border-accent/40 disabled:opacity-50 transition-colors"
            >
              {settlePending ? 'Waiting for MetaMask…' : '⛓ Settle on-chain'}
            </button>
            <button
              type="button"
              onClick={() => { setPendingSettle(null); reset() }}
              className="px-3 py-1.5 rounded text-xs text-gray-500 hover:text-gray-300 border border-border transition-colors"
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {/* tx hash confirmation */}
      {txHash && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3">
          <p className="text-[11px] text-green-400 font-semibold mb-1">⛓ Settlement submitted</p>
          <a
            href={`https://sepolia.etherscan.io/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-mono text-accent hover:underline break-all"
          >
            {txHash}
          </a>
        </div>
      )}

      {/* No wallet hint */}
      {!wallet && (
        <p className="text-[10px] text-gray-600 text-center pt-1">
          Connect wallet to enable on-chain settlement
        </p>
      )}
    </form>
  )
}
