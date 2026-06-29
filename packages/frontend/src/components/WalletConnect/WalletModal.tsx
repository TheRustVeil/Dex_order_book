'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { BlockchainNodes } from '@/components/Animations/BlockchainNodes'
import { SUPPORTED_CHAIN_IDS } from '@/lib/web3/config'
import { useDexStore } from '@/store/dex'

/* ─── Types ─── */
interface EthProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
  on: (event: string, handler: (...args: unknown[]) => void) => void
  removeListener: (event: string, handler: (...args: unknown[]) => void) => void
  isMetaMask?: boolean
  isCoinbaseWallet?: boolean
  isBraveWallet?: boolean
  isRainbow?: boolean
}

declare global {
  interface Window {
    ethereum?: EthProvider
    phantom?: { ethereum?: EthProvider }
    okxwallet?: EthProvider
    coinbaseWalletExtension?: EthProvider
  }
}

type WalletId = 'metamask' | 'coinbase' | 'brave' | 'rainbow' | 'phantom' | 'okx'

interface WalletDef {
  id: WalletId
  name: string
  description: string
  color: string
  gradient: string
  installUrl: string
  Icon: () => React.ReactElement
}

/* ─── Wallet icon SVGs (inline, no external deps) ─── */
function MetaMaskIcon() {
  return (
    <svg viewBox="0 0 40 40" fill="none" className="w-8 h-8">
      <rect width="40" height="40" rx="10" fill="#F6851B" />
      <path d="M33 7L22.5 14.7l1.9-4.5L33 7z" fill="#E2761B" stroke="#E2761B" strokeWidth="0.2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M7 7l10.4 7.8-1.8-4.6L7 7z" fill="#E4761B" stroke="#E4761B" strokeWidth="0.2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M29.1 26.6l-2.8 4.3 6 1.6 1.7-5.8-4.9-.1z" fill="#E4761B" stroke="#E4761B" strokeWidth="0.2"/>
      <path d="M6 26.7l1.7 5.8 6-1.6-2.8-4.3-4.9.1z" fill="#E4761B" stroke="#E4761B" strokeWidth="0.2"/>
      <path d="M13.4 19.1l-1.6 2.5 5.7.3-.2-6.1-3.9 3.3z" fill="#E4761B" stroke="#E4761B" strokeWidth="0.2"/>
      <path d="M26.6 19.1l-4-3.4-.1 6.2 5.7-.3-1.6-2.5z" fill="#E4761B" stroke="#E4761B" strokeWidth="0.2"/>
      <path d="M13.7 30.9l3.4-1.7-2.9-2.3-.5 4z" fill="#E4761B" stroke="#E4761B" strokeWidth="0.2"/>
      <path d="M22.9 29.2l3.4 1.7-.5-4-2.9 2.3z" fill="#E4761B" stroke="#E4761B" strokeWidth="0.2"/>
    </svg>
  )
}

function CoinbaseIcon() {
  return (
    <svg viewBox="0 0 40 40" fill="none" className="w-8 h-8">
      <rect width="40" height="40" rx="10" fill="#0052FF" />
      <circle cx="20" cy="20" r="10" fill="white" />
      <rect x="15" y="17" width="10" height="6" rx="2" fill="#0052FF" />
    </svg>
  )
}

function BraveIcon() {
  return (
    <svg viewBox="0 0 40 40" fill="none" className="w-8 h-8">
      <rect width="40" height="40" rx="10" fill="#FB542B" />
      <path d="M20 8l10 5v8c0 6-4.5 11-10 12C14.5 32 10 27 10 21v-8l10-5z" fill="white" opacity="0.15"/>
      <path d="M20 8l10 5v8c0 6-4.5 11-10 12C14.5 32 10 27 10 21v-8l10-5z" stroke="white" strokeWidth="1.5"/>
      <path d="M17 20l2 3 4-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function RainbowIcon() {
  return (
    <svg viewBox="0 0 40 40" fill="none" className="w-8 h-8">
      <rect width="40" height="40" rx="10" fill="#174299" />
      <path d="M8 26c0-6.6 5.4-12 12-12s12 5.4 12 12" stroke="#FF4D4D" strokeWidth="3" strokeLinecap="round" fill="none"/>
      <path d="M11 26c0-5 4-9 9-9s9 4 9 9" stroke="#FF9500" strokeWidth="3" strokeLinecap="round" fill="none"/>
      <path d="M14 26c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="#FFEB3B" strokeWidth="3" strokeLinecap="round" fill="none"/>
      <path d="M17 26c0-1.7 1.3-3 3-3s3 1.3 3 3" stroke="#4CAF50" strokeWidth="3" strokeLinecap="round" fill="none"/>
    </svg>
  )
}

function PhantomIcon() {
  return (
    <svg viewBox="0 0 40 40" fill="none" className="w-8 h-8">
      <rect width="40" height="40" rx="10" fill="#AB9FF2" />
      <path d="M20 10c-5.5 0-10 4.5-10 10 0 3 1.3 5.7 3.4 7.6-.4.9-.9 1.8-1.6 2.4h5.4c1.2.6 2.4 1 3.8 1 5.5 0 10-4.5 10-10S25.5 10 20 10z" fill="white"/>
      <circle cx="17" cy="20" r="1.5" fill="#AB9FF2"/>
      <circle cx="23" cy="20" r="1.5" fill="#AB9FF2"/>
    </svg>
  )
}

function OKXIcon() {
  return (
    <svg viewBox="0 0 40 40" fill="none" className="w-8 h-8">
      <rect width="40" height="40" rx="10" fill="#000" />
      <rect x="9" y="9" width="9" height="9" rx="1" fill="white"/>
      <rect x="22" y="9" width="9" height="9" rx="1" fill="white"/>
      <rect x="9" y="22" width="9" height="9" rx="1" fill="white"/>
      <rect x="22" y="22" width="9" height="9" rx="1" fill="white"/>
    </svg>
  )
}

/* ─── Wallet registry ─── */
const WALLETS: WalletDef[] = [
  {
    id: 'metamask',
    name: 'MetaMask',
    description: 'The most popular Ethereum wallet',
    color: '#F6851B',
    gradient: 'from-orange-500/20 to-amber-500/10',
    installUrl: 'https://metamask.io/download',
    Icon: MetaMaskIcon,
  },
  {
    id: 'coinbase',
    name: 'Coinbase Wallet',
    description: "Coinbase's self-custody wallet",
    color: '#0052FF',
    gradient: 'from-blue-600/20 to-blue-400/10',
    installUrl: 'https://www.coinbase.com/wallet/downloads',
    Icon: CoinbaseIcon,
  },
  {
    id: 'phantom',
    name: 'Phantom',
    description: 'Multi-chain wallet for DeFi & NFTs',
    color: '#AB9FF2',
    gradient: 'from-purple-500/20 to-purple-300/10',
    installUrl: 'https://phantom.com/download',
    Icon: PhantomIcon,
  },
  {
    id: 'rainbow',
    name: 'Rainbow',
    description: 'A fun, simple Ethereum wallet',
    color: '#174299',
    gradient: 'from-indigo-500/20 to-pink-400/10',
    installUrl: 'https://rainbow.me/download',
    Icon: RainbowIcon,
  },
  {
    id: 'brave',
    name: 'Brave Wallet',
    description: 'Built-in wallet for Brave browser',
    color: '#FB542B',
    gradient: 'from-orange-600/20 to-red-500/10',
    installUrl: 'https://brave.com/wallet',
    Icon: BraveIcon,
  },
  {
    id: 'okx',
    name: 'OKX Wallet',
    description: 'Web3 wallet by OKX exchange',
    color: '#ffffff',
    gradient: 'from-gray-500/20 to-gray-400/10',
    installUrl: 'https://www.okx.com/download',
    Icon: OKXIcon,
  },
]

/* ─── Provider detection ─── */
function getProvider(id: WalletId): EthProvider | null {
  if (typeof window === 'undefined') return null
  const eth = window.ethereum

  switch (id) {
    case 'metamask':
      return eth?.isMetaMask && !eth.isCoinbaseWallet && !eth.isBraveWallet ? eth : null
    case 'coinbase':
      return eth?.isCoinbaseWallet ? eth : (window.coinbaseWalletExtension ?? null)
    case 'brave':
      return eth?.isBraveWallet ? eth : null
    case 'rainbow':
      return eth?.isRainbow ? eth : null
    case 'phantom':
      return window.phantom?.ethereum ?? null
    case 'okx':
      return window.okxwallet ?? null
  }
}

function isDetected(id: WalletId): boolean {
  return getProvider(id) !== null
}

/* ─── Modal component ─── */
interface WalletModalProps {
  open: boolean
  onClose: () => void
}

export function WalletModal({ open, onClose }: WalletModalProps) {
  const { setWallet } = useDexStore()
  const [connecting, setConnecting] = useState<WalletId | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [detectedMap, setDetectedMap] = useState<Record<WalletId, boolean>>({} as Record<WalletId, boolean>)
  const backdropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const map = {} as Record<WalletId, boolean>
    WALLETS.forEach(w => { map[w.id] = isDetected(w.id) })
    setDetectedMap(map)
    setError(null)
  }, [open])

  const handleConnect = useCallback(async (wallet: WalletDef) => {
    const provider = getProvider(wallet.id)
    if (!provider) {
      window.open(wallet.installUrl, '_blank', 'noopener,noreferrer')
      return
    }
    setConnecting(wallet.id)
    setError(null)
    try {
      const accounts = await provider.request({ method: 'eth_requestAccounts' }) as string[]
      if (accounts[0]) {
        setWallet(accounts[0])
        onClose()
      }
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'message' in e ? (e as { message: string }).message : 'Connection rejected'
      setError(msg)
    } finally {
      setConnecting(null)
    }
  }, [setWallet, onClose])

  const handleBackdrop = useCallback((e: React.MouseEvent) => {
    if (e.target === backdropRef.current) onClose()
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  // Sort: detected first
  const sorted = [...WALLETS].sort((a, b) => {
    const da = detectedMap[a.id] ? 1 : 0
    const db = detectedMap[b.id] ? 1 : 0
    return db - da
  })

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdrop}
      className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop animate-fade-in"
    >
      <div className="w-full max-w-sm mx-4 rounded-2xl overflow-hidden glass-strong shadow-modal animate-slide-up">

        {/* ANIMATION 3: Blockchain node network hero */}
        <div className="relative h-44 overflow-hidden" style={{ background: '#04080f' }}>
          <BlockchainNodes className="absolute inset-0" />
          {/* Gradient overlay for legibility */}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-card" />
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-7 h-7 rounded-full glass flex items-center justify-center text-gray-400 hover:text-white transition-colors z-10"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Header text */}
        <div className="px-5 pt-4 pb-3">
          <h2 className="text-base font-bold text-white">Connect Wallet</h2>
          <p className="text-xs text-gray-500 mt-0.5">Choose a wallet to connect to ZeTheta DEX</p>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-5 mb-3 px-3 py-2 rounded-lg bg-red-900/20 border border-red-800/30 text-xs text-red-400">
            {error}
          </div>
        )}

        {/* Wallet list */}
        <div className="px-3 pb-4 space-y-1.5 max-h-72 overflow-y-auto">
          {sorted.map(wallet => {
            const detected = detectedMap[wallet.id]
            const isConnecting = connecting === wallet.id

            return (
              <button
                key={wallet.id}
                onClick={() => handleConnect(wallet)}
                disabled={!!connecting}
                className={`wallet-row w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                  detected
                    ? 'cursor-pointer'
                    : 'cursor-pointer opacity-70 hover:opacity-100'
                } disabled:cursor-wait`}
              >
                <wallet.Icon />

                <div className="flex-1 text-left min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">{wallet.name}</span>
                    {detected && (
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-green-900/30 text-green-400 border border-green-800/30">
                        Detected
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 truncate">{wallet.description}</p>
                </div>

                <div className="shrink-0">
                  {isConnecting ? (
                    <div className="w-4 h-4 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
                  ) : detected ? (
                    <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 text-gray-500">
                      <path d="M6 12l4-4-4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ) : (
                    <span className="text-[10px] font-semibold text-accent/70 hover:text-accent transition-colors">
                      Install →
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-5 pb-4 text-center">
          <p className="text-[10px] text-gray-600">
            By connecting, you agree to our{' '}
            <span className="text-gray-500">Terms of Service</span>
          </p>
        </div>
      </div>
    </div>
  )
}

/* ─── Connected wallet display ─── */
interface ConnectedBadgeProps {
  address: string
  chainId: number | null
  onDisconnect: () => void
  onSwitchNetwork: () => void
}

export function ConnectedBadge({ address, chainId, onDisconnect, onSwitchNetwork }: ConnectedBadgeProps) {
  const networkName = chainId ? (SUPPORTED_CHAIN_IDS[chainId] ?? `Chain ${chainId}`) : '—'
  const isWrongNetwork = chainId !== 11155111 && chainId !== 31337

  function shortenAddress(addr: string) {
    return addr.slice(0, 6) + '…' + addr.slice(-4)
  }

  return (
    <div className="flex items-center gap-2">
      {isWrongNetwork && (
        <button
          onClick={onSwitchNetwork}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold bg-yellow-900/20 text-yellow-400 border border-yellow-800/30 rounded-lg hover:bg-yellow-900/40 transition-all"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
            <path d="M8 2a6 6 0 100 12A6 6 0 008 2zm0 1.5a4.5 4.5 0 110 9 4.5 4.5 0 010-9zM8 5v3.5l2.5 1.5-.75 1.25L7 9.5V5H8z"/>
          </svg>
          Switch Network
        </button>
      )}

      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl glass border-neon">
        <div className="w-1.5 h-1.5 rounded-full bg-bid animate-pulse-slow" />
        <div>
          <div className="text-xs font-mono font-semibold text-white leading-none">
            {shortenAddress(address)}
          </div>
          <div className="text-[9px] text-gray-500 leading-none mt-0.5">{networkName}</div>
        </div>
        <button
          onClick={onDisconnect}
          title="Disconnect"
          className="ml-1 w-4 h-4 rounded flex items-center justify-center text-gray-600 hover:text-red-400 transition-colors"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
            <path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3M10 11l3-3-3-3M13 8H6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
