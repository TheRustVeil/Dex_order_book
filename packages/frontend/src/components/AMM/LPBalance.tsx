'use client'
import { useEffect } from 'react'
import { useDexStore } from '@/store/dex'
import { API_URL } from '@/lib/api'

export function LPBalance() {
  const { ammPool, lpPosition, wallet, setLpPosition } = useDexStore()

  useEffect(() => {
    if (!wallet) return
    async function fetchLpPosition() {
      try {
        const res = await fetch(`${API_URL}/amm/position?wallet=${wallet}`)
        const data = await res.json()
        if (data.success) setLpPosition(data.position)
      } catch {}
    }
    fetchLpPosition()
    const id = setInterval(fetchLpPosition, 10_000)
    return () => clearInterval(id)
  }, [wallet, setLpPosition])

  if (!lpPosition || !lpPosition.lpBalance || lpPosition.lpBalance <= 0) {
    return (
      <div className="bg-bg rounded p-3 border border-border">
        <div className="text-xs text-gray-500">Your LP Position</div>
        <div className="text-xs text-gray-600 mt-1">
          {wallet ? 'No active LP position' : 'Connect wallet to view position'}
        </div>
      </div>
    )
  }

  const { lpBalance, totalSupply, sharePercent, valueA, valueB, entryPrice, impermanentLoss } = lpPosition

  return (
    <div className="bg-bg rounded p-3 border border-border space-y-2">
      <div className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Your LP Position</div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="text-gray-500">LP Balance</div>
          <div className="font-mono text-white">{(lpBalance ?? 0).toFixed(6)} <span className="text-gray-500">ZLP</span></div>
        </div>
        <div>
          <div className="text-gray-500">Pool Share</div>
          <div className="font-mono text-white">{(sharePercent ?? 0).toFixed(4)}%</div>
        </div>
        <div>
          <div className="text-gray-500">ETH Value</div>
          <div className="font-mono text-white">{(valueA ?? 0).toFixed(4)}</div>
        </div>
        <div>
          <div className="text-gray-500">USDC Value</div>
          <div className="font-mono text-white">{(valueB ?? 0).toFixed(2)}</div>
        </div>
        {entryPrice != null && (
          <>
            <div>
              <div className="text-gray-500">Entry Price</div>
              <div className="font-mono text-white">${entryPrice.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-gray-500">IL</div>
              <div className={`font-mono ${(impermanentLoss ?? 0) < -0.001 ? 'text-red-400' : 'text-green-400'}`}>
                {impermanentLoss != null ? `${(impermanentLoss * 100).toFixed(3)}%` : '—'}
              </div>
            </div>
          </>
        )}
      </div>

      {ammPool && (
        <div className="text-[10px] text-gray-600 border-t border-border/50 pt-2">
          Total pool: {ammPool.reserveA.toFixed(4)} ETH + {ammPool.reserveB.toFixed(2)} USDC
          {' '}(TVL ≈ ${(ammPool.reserveB * 2).toFixed(0)})
        </div>
      )}
    </div>
  )
}
