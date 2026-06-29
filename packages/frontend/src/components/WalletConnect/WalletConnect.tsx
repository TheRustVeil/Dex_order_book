'use client'

import { useState, useEffect, useCallback } from 'react'
import { useDexStore } from '@/store/dex'
import { WalletModal, ConnectedBadge } from './WalletModal'

// Extended provider type — Eip1193Provider (from ethers global) plus MetaMask events
interface MetaMaskProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
  on: (event: string, handler: (...args: unknown[]) => void) => void
  removeListener: (event: string, handler: (...args: unknown[]) => void) => void
}

function getMetaMask(): MetaMaskProvider | undefined {
  return window.ethereum as unknown as MetaMaskProvider | undefined
}

export function WalletConnect() {
  const { setWallet } = useDexStore()
  const [address, setAddress] = useState<string | null>(null)
  const [chainId, setChainId] = useState<number | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  /* ── Keep in sync with wallet events ── */
  useEffect(() => {
    const handleAccountsChanged = (accounts: unknown) => {
      const addr = (accounts as string[])[0] ?? null
      setAddress(addr)
      setWallet(addr)
    }
    const handleChainChanged = (id: unknown) => {
      setChainId(parseInt(id as string, 16))
    }

    const mm = getMetaMask()
    if (mm) {
      mm.on('accountsChanged', handleAccountsChanged)
      mm.on('chainChanged', handleChainChanged)

      mm.request({ method: 'eth_accounts' })
        .then(accs => {
          const accounts = accs as string[]
          if (accounts.length > 0) {
            setAddress(accounts[0])
            setWallet(accounts[0])
            mm.request({ method: 'eth_chainId' }).then(id => {
              setChainId(parseInt(id as string, 16))
            }).catch(() => {})
          }
        }).catch(() => {})
    }

    return () => {
      const mm2 = getMetaMask()
      if (mm2) {
        mm2.removeListener('accountsChanged', handleAccountsChanged)
        mm2.removeListener('chainChanged', handleChainChanged)
      }
    }
  }, [setWallet])

  const disconnect = useCallback(() => {
    setAddress(null)
    setChainId(null)
    setWallet(null)
  }, [setWallet])

  const switchToSepolia = useCallback(async () => {
    const mm = getMetaMask()
    if (!mm) return
    try {
      await mm.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0xaa36a7' }],
      })
    } catch { /* ignored */ }
  }, [])

  if (address) {
    return (
      <ConnectedBadge
        address={address}
        chainId={chainId}
        onDisconnect={disconnect}
        onSwitchNetwork={switchToSepolia}
      />
    )
  }

  return (
    <>
      <button
        onClick={() => setModalOpen(true)}
        className="relative group flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold overflow-hidden transition-all duration-200"
        style={{
          background: 'linear-gradient(135deg, rgba(79,142,247,0.15) 0%, rgba(0,212,255,0.1) 100%)',
          border: '1px solid rgba(79,142,247,0.3)',
          color: '#4f8ef7',
        }}
      >
        {/* Shimmer effect on hover */}
        <span className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          style={{
            background: 'linear-gradient(135deg, rgba(79,142,247,0.25) 0%, rgba(0,212,255,0.2) 100%)',
          }}
        />
        <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5 relative z-10" stroke="currentColor" strokeWidth="1.5">
          <rect x="2" y="5" width="12" height="9" rx="1.5"/>
          <path d="M5 5V4a3 3 0 016 0v1"/>
          <circle cx="8" cy="10" r="1.5" fill="currentColor"/>
        </svg>
        <span className="relative z-10">Connect Wallet</span>
      </button>

      <WalletModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  )
}
