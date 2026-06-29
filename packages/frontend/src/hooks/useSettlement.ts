'use client'
import { useState, useCallback } from 'react'
import { callSettleTrade } from '@/lib/web3/contracts'

// Placeholder token addresses for Sepolia (WETH / USDC).
// In production these come from TokenRegistry on-chain.
const WETH_SEPOLIA  = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14'
const USDC_SEPOLIA  = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'

export interface SettlementParams {
  buyer:      string
  seller:     string
  quantity:   number   // ETH amount (base)
  price:      number   // USDC per ETH (quote)
  side:       'buy' | 'sell'
}

export interface SettlementState {
  pending:  boolean
  txHash:   string | null
  error:    string | null
}

export function useSettlement() {
  const [state, setState] = useState<SettlementState>({
    pending: false,
    txHash:  null,
    error:   null,
  })

  const settle = useCallback(async (params: SettlementParams) => {
    setState({ pending: true, txHash: null, error: null })
    try {
      if (!window.ethereum) throw new Error('MetaMask not found')

      // buyer pays USDC, seller delivers ETH
      const buyer      = params.side === 'buy'  ? params.buyer  : params.seller
      const seller     = params.side === 'sell' ? params.buyer  : params.seller
      const baseToken  = WETH_SEPOLIA
      const quoteToken = USDC_SEPOLIA

      const tx = await callSettleTrade(buyer, seller, baseToken, quoteToken, params.quantity, params.price)
      setState({ pending: false, txHash: tx.hash, error: null })
      return tx.hash
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      // Extract short reason from ethers error if present
      const reason = msg.includes('reason=') ? msg.split('reason=')[1].split(',')[0].replace(/"/g, '') : msg
      setState({ pending: false, txHash: null, error: reason })
      return null
    }
  }, [])

  const reset = useCallback(() => {
    setState({ pending: false, txHash: null, error: null })
  }, [])

  return { ...state, settle, reset }
}
