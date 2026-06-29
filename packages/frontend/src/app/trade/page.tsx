'use client'
import { useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { ZeThetaLogo } from '@/components/Brand/ZeThetaLogo'
import { useDexStream } from '@/hooks/useDexStream'
import { useDexStore } from '@/store/dex'
import { OrderBookPanel }   from '@/components/OrderBook/OrderBookPanel'
import { OrderForm }        from '@/components/OrderBook/OrderForm'
import { DepthChart }       from '@/components/OrderBook/DepthChart'
import { SpreadChart }      from '@/components/OrderBook/SpreadChart'
import { TradeHistory }     from '@/components/OrderBook/TradeHistory'
import { OpenOrdersTable }  from '@/components/OrderBook/OpenOrdersTable'
import { OrderHistory }     from '@/components/OrderBook/OrderHistory'
import { VolumeChart }      from '@/components/OrderBook/VolumeChart'
import { AMMPanel }         from '@/components/AMM/AMMPanel'
import { AddLiquidity }     from '@/components/AMM/AddLiquidity'
import { RemoveLiquidity }  from '@/components/AMM/RemoveLiquidity'
import { LPBalance }        from '@/components/AMM/LPBalance'
import { ILCalculator }     from '@/components/AMM/ILCalculator'
import { WalletConnect }    from '@/components/WalletConnect/WalletConnect'
import { ParticleField }    from '@/components/Animations/ParticleField'
import { HexOrb }           from '@/components/Animations/HexOrb'

const PriceChart = dynamic(
  () => import('@/components/TradingView/PriceChart').then(m => ({ default: m.PriceChart })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full text-muted text-sm">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
          <span className="text-xs">Loading chart…</span>
        </div>
      </div>
    ),
  }
)

type CenterTab = 'price' | 'volume'
type RightTab  = 'trade' | 'amm' | 'orders'

function StatusBar() {
  const { connected, lastOrderResult, lastTxHash, snapshot } = useDexStore()
  return (
    <div className="flex items-center gap-4 px-4 py-1.5 border-b text-xs shrink-0"
      style={{ borderColor: 'var(--border)', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}>
      <div className="flex items-center gap-1.5">
        <div className="relative">
          <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-bid' : 'bg-ask'}`} />
          {connected && (
            <div className="absolute inset-0 rounded-full bg-bid animate-ping opacity-60" />
          )}
        </div>
        <span style={{ color: connected ? 'var(--bid)' : 'var(--ask)' }} className="font-medium">
          {connected ? 'Live' : 'Reconnecting…'}
        </span>
      </div>

      {snapshot && (
        <>
          <div className="w-px h-3" style={{ background: 'var(--border)' }} />
          <div className="text-gray-500">
            Last:{' '}
            <span className="font-mono font-semibold text-white">
              ${snapshot.lastPrice?.toFixed(2) ?? '—'}
            </span>
          </div>
          <div className="text-gray-500">
            Spread:{' '}
            <span className="font-mono font-semibold" style={{ color: '#f59e0b' }}>
              {snapshot.spreadPct?.toFixed(3) ?? '—'}%
            </span>
          </div>
        </>
      )}

      {lastOrderResult && (
        <>
          <div className="w-px h-3" style={{ background: 'var(--border)' }} />
          <div className="text-gray-400 truncate max-w-xs">{lastOrderResult}</div>
        </>
      )}

      {lastTxHash && (
        <>
          <div className="w-px h-3" style={{ background: 'var(--border)' }} />
          <span className="text-green-500 font-semibold">⛓</span>
          <a
            href={`https://sepolia.etherscan.io/tx/${lastTxHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-accent hover:underline"
            title={lastTxHash}
          >
            {lastTxHash.slice(0, 10)}…{lastTxHash.slice(-6)}
          </a>
        </>
      )}

      <div className="ml-auto flex items-center gap-2 text-gray-600">
        <span className="w-1 h-1 rounded-full bg-gray-700" />
        <span>ETH / USDC</span>
        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
          style={{ background: 'rgba(79,142,247,0.1)', color: 'rgba(79,142,247,0.7)', border: '1px solid rgba(79,142,247,0.15)' }}>
          Sepolia
        </span>
      </div>
    </div>
  )
}

function Tabs<T extends string>({
  tabs, active, onChange,
}: {
  tabs: { value: T; label: string }[]
  active: T
  onChange: (t: T) => void
}) {
  return (
    <div className="flex shrink-0" style={{ borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.9)' }}>
      {tabs.map(t => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={`relative px-4 py-2 text-[11px] font-bold uppercase tracking-widest transition-all duration-200 ${
            active === t.value
              ? 'text-accent'
              : 'text-gray-600 hover:text-gray-400'
          }`}
        >
          {t.label}
          {active === t.value && (
            <span
              className="absolute bottom-0 left-0 right-0 h-px"
              style={{ background: 'linear-gradient(90deg, transparent, var(--accent), transparent)' }}
            />
          )}
        </button>
      ))}
    </div>
  )
}

function SectionHeader({
  children,
  className = '',
  style,
}: {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div className={`section-header ${className}`} style={style}>
      {children}
    </div>
  )
}

export default function TradePage() {
  useDexStream()
  const [centerTab, setCenterTab] = useState<CenterTab>('price')
  const [rightTab,  setRightTab]  = useState<RightTab>('trade')

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: 'var(--bg)', color: '#e2e8f0' }}>

      <div
        className="fixed inset-0 pointer-events-none"
        style={{ zIndex: 0 }}
        aria-hidden="true"
      >
        <ParticleField count={60} maxDist={120} color="255, 255, 255" />
      </div>

      <div className="relative flex flex-col h-full" style={{ zIndex: 1 }}>

        <header className="flex items-center gap-3 px-4 py-2.5 shrink-0 relative overflow-hidden"
          style={{
            borderBottom: '1px solid var(--border)',
            background: 'rgba(0,0,0,0.96)',
            backdropFilter: 'blur(20px)',
          }}>

          <div className="absolute bottom-0 left-0 right-0 h-px"
            style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(79,142,247,0.4) 40%, rgba(0,212,255,0.4) 60%, transparent 100%)' }} />

          {/* Logo links back to landing */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <ZeThetaLogo size={28} className="shrink-0" />
            <div>
              <h1 className="text-sm font-bold tracking-wide gradient-text leading-none">
                DEX Order Book
              </h1>
              <p className="text-[9px] text-gray-600 leading-none mt-0.5">by ZeTheta Algorithms</p>
            </div>
          </Link>

          <div className="relative w-14 h-12 rounded-xl overflow-hidden ml-2 shrink-0"
            style={{ border: '1px solid rgba(0,212,255,0.2)', background: 'rgba(0,10,24,0.9)', boxShadow: '0 0 20px rgba(0,212,255,0.12)' }}>
            <HexOrb />
          </div>

          <div className="flex items-center gap-1.5 ml-1 px-2 py-1 rounded-lg"
            style={{ background: 'rgba(79,142,247,0.07)', border: '1px solid rgba(79,142,247,0.12)' }}>
            <div className="w-1 h-1 rounded-full" style={{ background: 'var(--bid)' }} />
            <span className="text-[10px] font-semibold text-gray-500">Sepolia</span>
          </div>

          <div className="ml-auto">
            <WalletConnect />
          </div>
        </header>

        <StatusBar />

        <div className="flex-1 grid overflow-hidden min-h-0"
          style={{ gridTemplateColumns: '280px 1fr 300px' }}>

          <div className="flex flex-col overflow-hidden"
            style={{ borderRight: '1px solid var(--border)' }}>
            <SectionHeader>Order Book</SectionHeader>
            <div className="flex-1 min-h-0">
              <OrderBookPanel />
            </div>
            <SectionHeader className="border-t" style={{ borderTopColor: 'var(--border)' }}>
              Recent Trades
            </SectionHeader>
            <div className="h-44 min-h-0">
              <TradeHistory />
            </div>
          </div>

          <div className="flex flex-col overflow-hidden">
            <Tabs
              tabs={[
                { value: 'price',  label: 'Price Chart' },
                { value: 'volume', label: 'Volume' },
              ]}
              active={centerTab}
              onChange={setCenterTab}
            />
            <div className="flex-1 min-h-0 p-2">
              {centerTab === 'price'  && <PriceChart />}
              {centerTab === 'volume' && <VolumeChart />}
            </div>
            <div className="grid grid-cols-2 h-48 min-h-0" style={{ borderTop: '1px solid var(--border)' }}>
              <div className="flex flex-col overflow-hidden" style={{ borderRight: '1px solid var(--border)' }}>
                <SectionHeader>Order Depth</SectionHeader>
                <div className="flex-1 min-h-0 p-2">
                  <DepthChart />
                </div>
              </div>
              <div className="flex flex-col overflow-hidden">
                <SectionHeader>Spread Dynamics</SectionHeader>
                <div className="flex-1 min-h-0 p-2">
                  <SpreadChart />
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col overflow-hidden" style={{ borderLeft: '1px solid var(--border)' }}>
            <Tabs
              tabs={[
                { value: 'trade',  label: 'Trade' },
                { value: 'amm',    label: 'AMM' },
                { value: 'orders', label: 'Orders' },
              ]}
              active={rightTab}
              onChange={setRightTab}
            />

            <div className="flex-1 overflow-auto">
              {rightTab === 'trade' && (
                <div className="p-3">
                  <OrderForm />
                </div>
              )}
              {rightTab === 'amm' && (
                <div>
                  <div className="p-3" style={{ borderBottom: '1px solid var(--border)' }}>
                    <LPBalance />
                  </div>
                  <div className="p-3" style={{ borderBottom: '1px solid var(--border)' }}>
                    <AMMPanel />
                  </div>
                  <div className="p-3" style={{ borderBottom: '1px solid var(--border)' }}>
                    <AddLiquidity />
                  </div>
                  <div className="p-3" style={{ borderBottom: '1px solid var(--border)' }}>
                    <RemoveLiquidity />
                  </div>
                  <div className="p-3">
                    <ILCalculator />
                  </div>
                </div>
              )}
              {rightTab === 'orders' && (
                <div>
                  <div className="p-3" style={{ borderBottom: '1px solid var(--border)' }}>
                    <OpenOrdersTable />
                  </div>
                  <div className="p-3">
                    <OrderHistory />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
