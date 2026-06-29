'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { ZeThetaLogo } from '@/components/Brand/ZeThetaLogo'

/* ─── Scroll-reveal hook ─────────────────────────────────── */
function useScrollReveal() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add('reveal-visible')
        })
      },
      { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
    )
    document.querySelectorAll('.reveal').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])
}

/* ─── Animated candlestick background ───────────────────── */
function CandlestickBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf: number
    const CW = 7
    const GAP = 16

    interface Candle {
      x: number
      open: number
      close: number
      high: number
      low: number
      speed: number
      opacity: number
    }

    let candles: Candle[] = []

    function rnd(min: number, max: number) {
      return min + Math.random() * (max - min)
    }

    function makeCandle(x: number): Candle {
      const H = canvas!.height
      const mid = H * rnd(0.15, 0.85)
      const body = rnd(8, 90)
      const o = mid
      const c = mid + (Math.random() < 0.5 ? 1 : -1) * body
      return {
        x,
        open: o, close: c,
        high: Math.min(o, c) - rnd(4, 28),
        low: Math.max(o, c) + rnd(4, 28),
        speed: rnd(0.12, 0.35),
        opacity: rnd(0.04, 0.14),
      }
    }

    function resize() {
      canvas!.width = canvas!.offsetWidth
      canvas!.height = canvas!.offsetHeight
      const count = Math.ceil(canvas!.width / (CW + GAP)) + 4
      candles = Array.from({ length: count }, (_, i) =>
        makeCandle(i * (CW + GAP))
      )
    }

    function tick() {
      const W = canvas!.width
      const H = canvas!.height
      ctx!.clearRect(0, 0, W, H)

      for (const c of candles) {
        const bull = c.close <= c.open
        const col = bull
          ? `rgba(0,199,122,${c.opacity})`
          : `rgba(242,54,69,${c.opacity})`
        const cx = c.x + CW / 2

        ctx!.strokeStyle = col
        ctx!.lineWidth = 1
        ctx!.beginPath()
        ctx!.moveTo(cx, c.high)
        ctx!.lineTo(cx, c.low)
        ctx!.stroke()

        ctx!.fillStyle = col
        const top = Math.min(c.open, c.close)
        const h = Math.max(Math.abs(c.open - c.close), 1)
        ctx!.fillRect(c.x, top, CW, h)

        c.x -= c.speed
        if (c.x + CW < 0) {
          c.x = W + CW
          const mid = H * rnd(0.15, 0.85)
          const body = rnd(8, 90)
          c.open = mid
          c.close = mid + (Math.random() < 0.5 ? 1 : -1) * body
          c.high = Math.min(c.open, c.close) - rnd(4, 28)
          c.low = Math.max(c.open, c.close) + rnd(4, 28)
          c.opacity = rnd(0.04, 0.14)
        }
      }

      raf = requestAnimationFrame(tick)
    }

    resize()
    tick()

    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    />
  )
}

/* ─── Section visuals ─────────────────────────────────────── */

function CLOBVisual() {
  const asks = [38, 52, 68, 84, 100]
  const bids = [92, 74, 54, 34, 18]
  return (
    <div style={{ fontFamily: 'monospace', fontSize: 11, userSelect: 'none' }}>
      {asks.map((w, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 3 }}>
          <span style={{ color: 'rgba(242,54,69,0.55)', width: 52, textAlign: 'right', fontSize: 10 }}>
            {(2012 + i * 2).toFixed(2)}
          </span>
          <div style={{ width: w, height: 14, background: 'rgba(242,54,69,0.12)', border: '1px solid rgba(242,54,69,0.22)', borderRadius: 2 }} />
        </div>
      ))}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '6px 0' }} />
      {bids.map((w, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 3 }}>
          <span style={{ color: 'rgba(0,199,122,0.55)', width: 52, textAlign: 'right', fontSize: 10 }}>
            {(2000 - i * 2).toFixed(2)}
          </span>
          <div style={{ width: w, height: 14, background: 'rgba(0,199,122,0.12)', border: '1px solid rgba(0,199,122,0.22)', borderRadius: 2 }} />
        </div>
      ))}
    </div>
  )
}

function AMMVisual() {
  const pts: string[] = []
  for (let x = 30; x <= 200; x += 4) {
    const y = 200 - 6000 / x
    if (y > 10 && y < 195) pts.push(`${x},${y}`)
  }
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p}`).join(' ')
  const [ix, iy] = [100, 200 - 6000 / 100]
  return (
    <svg width="220" height="180" viewBox="0 20 220 200" style={{ overflow: 'visible' }}>
      <path d={d} stroke="rgba(79,142,247,0.4)" strokeWidth="2" fill="none" />
      <circle cx={ix} cy={iy} r="6" fill="rgba(79,142,247,0.7)" />
      <line x1={ix} y1={iy} x2={ix} y2="220" stroke="rgba(255,255,255,0.08)" strokeWidth="1" strokeDasharray="4,3" />
      <line x1="10" y1={iy} x2={ix} y2={iy} stroke="rgba(255,255,255,0.08)" strokeWidth="1" strokeDasharray="4,3" />
      <text x={ix + 10} y={iy - 4} fill="rgba(79,142,247,0.65)" fontSize="10" fontFamily="monospace">x · y = k</text>
      <text x="32" y="215" fill="rgba(255,255,255,0.2)" fontSize="9" fontFamily="monospace">ETH reserve →</text>
    </svg>
  )
}

function P2PVisual() {
  const nodes = [
    { x: 110, y: 40, main: true },
    { x: 40,  y: 100, main: false },
    { x: 180, y: 100, main: false },
    { x: 65,  y: 168, main: false },
    { x: 155, y: 168, main: false },
    { x: 110, y: 200, main: false },
  ]
  const edges = [[0,1],[0,2],[1,2],[1,3],[2,4],[3,5],[4,5],[0,5]]
  return (
    <svg width="220" height="230" viewBox="0 0 220 230">
      {edges.map(([a, b], i) => (
        <line
          key={i}
          x1={nodes[a].x} y1={nodes[a].y}
          x2={nodes[b].x} y2={nodes[b].y}
          stroke="rgba(79,142,247,0.18)"
          strokeWidth="1.5"
        />
      ))}
      {nodes.map((n, i) => (
        <g key={i}>
          {n.main && (
            <circle cx={n.x} cy={n.y} r="14" fill="rgba(79,142,247,0.06)" stroke="rgba(79,142,247,0.2)" strokeWidth="1" />
          )}
          <circle
            cx={n.x} cy={n.y} r={n.main ? 7 : 5}
            fill={n.main ? 'rgba(79,142,247,0.65)' : 'rgba(255,255,255,0.18)'}
            stroke={n.main ? 'rgba(79,142,247,0.9)' : 'rgba(255,255,255,0.3)'}
            strokeWidth="1.5"
          />
        </g>
      ))}
    </svg>
  )
}

function SettlementVisual() {
  const lines = [
    { text: '// settle matched trade', accent: true },
    { text: 'await settlement.settleTrade(', accent: false },
    { text: '  buyer,  seller,', accent: false },
    { text: '  price:  2000n,', accent: false },
    { text: '  qty:    1n,', accent: false },
    { text: ')', accent: false },
    { text: '→ tx: 0x4a3b…f91c', accent: true },
  ]
  return (
    <div style={{
      background: '#0a0a0a',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 10,
      padding: '18px 22px',
      fontFamily: 'ui-monospace, monospace',
      fontSize: 12,
      lineHeight: 1.75,
      minWidth: 260,
    }}>
      <div style={{ display: 'flex', gap: 5, marginBottom: 14 }}>
        {[0,1,2].map(i => (
          <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(255,255,255,0.15)' }} />
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 9, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.05em' }}>settlement.ts</span>
      </div>
      {lines.map((l, i) => (
        <div key={i} style={{ color: l.accent ? 'rgba(0,199,122,0.75)' : 'rgba(255,255,255,0.5)' }}>
          {l.text}
        </div>
      ))}
    </div>
  )
}

/* ─── Data ───────────────────────────────────────────────── */
const FEATURES = [
  {
    num: '01',
    tag: 'Matching',
    title: 'CLOB Engine',
    desc: 'Price-time priority matching. Every order is queued with a nanosecond timestamp — the best price wins; ties go first-in, first-out. Partial fills, market orders, and cancels are all atomic.',
    visual: <CLOBVisual />,
  },
  {
    num: '02',
    tag: 'Liquidity',
    title: 'AMM Hybrid\nRouting',
    desc: 'When the order book cannot fully fill a trade, the remainder is automatically routed to the constant-product (x·y=k) liquidity pool. The split is shown in real time — no slippage surprises.',
    visual: <AMMVisual />,
  },
  {
    num: '03',
    tag: 'Decentralized',
    title: 'Real-time\nP2P Network',
    desc: 'LibP2P with GossipSub and Kademlia DHT. Orders propagate to every peer node in milliseconds. Any node can match inbound orders — no central sequencer, no single point of failure.',
    visual: <P2PVisual />,
  },
  {
    num: '04',
    tag: 'Settlement',
    title: 'On-Chain\nSettlement',
    desc: 'Matched trades settle via the Settlement contract on Ethereum Sepolia. All 6 contracts are verified on Sourcify. The deployer private key never touches the frontend.',
    visual: <SettlementVisual />,
  },
]

const STEPS = [
  {
    title: 'Connect Wallet',
    desc: 'MetaMask, Coinbase Wallet, or Phantom. No account creation. No KYC. Just a Sepolia wallet address.',
    code: "await window.ethereum\n  .request({ method: 'eth_requestAccounts' })",
  },
  {
    title: 'Place Order',
    desc: 'Set price, quantity, and direction. The CLOB engine matches instantly. Any remainder is routed to the AMM pool automatically.',
    code: "POST /orders\n{ side: 'buy', qty: 1, price: 2000 }",
  },
  {
    title: 'Settle On-Chain',
    desc: 'One click sends the matched trade to the Settlement contract on Sepolia. The transaction hash appears in the status bar with an Etherscan link.',
    code: "settleTrade(buyer, seller, price, qty)\n→ 0x4a3b…f91c ✓",
  },
]

const STATS = [
  { v: '96 / 96',  l: 'Tests Passing' },
  { v: '6',        l: 'Smart Contracts' },
  { v: 'Sepolia',  l: 'Deployed Live' },
  { v: 'Sourcify', l: 'Verified' },
]

/* ─── Landing page ───────────────────────────────────────── */
export default function LandingPage() {
  useScrollReveal()

  return (
    <div style={{ background: '#000', color: '#fff', minHeight: '100vh', fontFamily: 'ui-sans-serif,system-ui,sans-serif' }}>

      {/* ── Fixed nav ── */}
      <nav className="lp-nav" style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ZeThetaLogo />
          <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: '-0.01em' }}>ZeTheta DEX</span>
          <span className="lp-nav-subtitle" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.3)', marginLeft: 6 }}>
            by ZeTheta Algorithms
          </span>
        </div>
        <Link
          href="/trade"
          style={{
            padding: '9px 22px', borderRadius: 8, fontSize: 13, fontWeight: 700,
            background: '#fff', color: '#000', textDecoration: 'none',
            transition: 'opacity 0.15s',
            display: 'inline-block',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.82' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
        >
          Launch App →
        </Link>
      </nav>

      {/* ── Hero ── */}
      <section className="lp-hero" style={{ position: 'relative', height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', overflow: 'hidden' }}>
        {/* Candlestick animation — right half */}
        <div style={{ position: 'absolute', inset: 0, left: '40%' }}>
          <CandlestickBg />
        </div>
        {/* Left-to-right gradient mask */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(90deg, #000 0%, #000 35%, rgba(0,0,0,0.75) 55%, rgba(0,0,0,0.1) 100%)',
          pointerEvents: 'none',
        }} />

        {/* Hero text */}
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 680 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const,
            color: 'rgba(255,255,255,0.4)', marginBottom: 36,
            padding: '6px 14px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20,
          }}>
            <span className="animate-live" style={{ width: 6, height: 6, borderRadius: '50%', background: '#00c77a', display: 'inline-block' }} />
            Ethereum Sepolia · Live
          </div>

          <h1 style={{
            fontSize: 'clamp(34px, 5.5vw, 72px)',
            fontWeight: 900,
            lineHeight: 1.0,
            letterSpacing: '-0.035em',
            margin: '0 0 28px 0',
          }}>
            Professional-<br />Grade<br />
            <span style={{ color: 'rgba(255,255,255,0.3)' }}>Decentralized<br />Exchange</span>
          </h1>

          <p style={{ fontSize: 17, lineHeight: 1.65, color: 'rgba(255,255,255,0.45)', maxWidth: 460, margin: '0 0 44px 0' }}>
            Hybrid CLOB + AMM matching engine with LibP2P gossip propagation and on-chain settlement on Ethereum.
          </p>

          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' as const }}>
            <Link
              href="/trade"
              style={{
                padding: '15px 36px', borderRadius: 10, fontSize: 15, fontWeight: 700,
                background: '#fff', color: '#000', textDecoration: 'none',
                transition: 'transform 0.18s, opacity 0.18s', display: 'inline-block',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.025)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}
            >
              Launch Trading App →
            </Link>
            <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.35)', fontWeight: 500 }}>
              Sepolia testnet · No real funds
            </span>
          </div>
        </div>

        {/* Stats row pinned to bottom */}
        <div className="lp-stats-row" style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          display: 'flex',
          borderTop: '1px solid rgba(255,255,255,0.07)',
        }}>
          {STATS.map((s, i) => (
            <div key={i} className="lp-stat-item" style={{
              flex: 1, textAlign: 'center', padding: '20px 0',
              borderRight: i < STATS.length - 1 ? '1px solid rgba(255,255,255,0.07)' : 'none',
            }}>
              <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 4 }}>{s.v}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' as const, letterSpacing: '0.09em' }}>{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Feature sections ── */}
      {FEATURES.map((f, i) => (
        <section
          key={f.num}
          className="reveal lp-feature-grid"
          style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
        >
          {/* Left: text */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.22)', fontVariantNumeric: 'tabular-nums' }}>{f.num}</span>
              <span style={{ width: 1, height: 12, background: 'rgba(255,255,255,0.1)' }} />
              <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' as const, letterSpacing: '0.1em' }}>{f.tag}</span>
            </div>
            <h2 style={{
              fontSize: 'clamp(24px, 3.2vw, 44px)',
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: '-0.025em',
              marginBottom: 18,
              whiteSpace: 'pre-line',
            }}>{f.title}</h2>
            <p style={{ fontSize: 16, lineHeight: 1.75, color: 'rgba(255,255,255,0.42)', maxWidth: 440 }}>{f.desc}</p>
          </div>

          {/* Right: visual */}
          <div className={`reveal reveal-delay-2`} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            {f.visual}
          </div>
        </section>
      ))}

      {/* ── Process section (white background) ── */}
      <section className="lp-process-px" style={{
        borderTop: '1px solid rgba(255,255,255,0.07)',
        background: '#fff',
        color: '#000',
        padding: '80px 40px 64px',
      }}>
        <div className="reveal" style={{ marginBottom: 80 }}>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.35)', textTransform: 'uppercase' as const, letterSpacing: '0.12em', marginBottom: 20 }}>— Process</div>
          <h2 style={{
            fontSize: 'clamp(28px, 4vw, 56px)',
            fontWeight: 900,
            lineHeight: 1.05,
            letterSpacing: '-0.03em',
            margin: 0,
          }}>
            Three steps.<br />
            <span style={{ color: 'rgba(0,0,0,0.25)' }}>Zero docs<br />on-chain.</span>
          </h2>
        </div>

        {STEPS.map((s, i) => (
          <div key={i} className="reveal lp-step-row">
            <div className="lp-step-num" style={{ fontSize: 13, fontWeight: 700, color: 'rgba(0,0,0,0.25)', paddingTop: 4 }}>|</div>
            <div>
              <h3 style={{ fontSize: 'clamp(17px, 1.8vw, 22px)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 10, marginTop: 0 }}>{s.title}</h3>
              <p style={{ fontSize: 14, lineHeight: 1.65, color: 'rgba(0,0,0,0.5)', maxWidth: 380, margin: 0 }}>{s.desc}</p>
            </div>
            <div className="lp-step-code" style={{
              background: '#000',
              borderRadius: 10,
              padding: '14px 20px',
              fontFamily: 'ui-monospace, monospace',
              fontSize: 12,
              lineHeight: 1.7,
              color: 'rgba(255,255,255,0.55)',
            }}>{s.code}</div>
          </div>
        ))}
      </section>

      {/* ── CTA section ── */}
      <section
        className="reveal lp-hero"
        style={{
          borderTop: '1px solid rgba(255,255,255,0.07)',
          padding: '100px 40px 80px',
          textAlign: 'center',
        }}
      >
        <h2 style={{
          fontSize: 'clamp(26px, 3.5vw, 52px)',
          fontWeight: 900,
          letterSpacing: '-0.03em',
          marginBottom: 36,
          marginTop: 0,
          lineHeight: 1.1,
        }}>
          Ready to trade?
        </h2>
        <Link
          href="/trade"
          style={{
            display: 'inline-block', padding: '18px 52px', borderRadius: 12,
            background: '#fff', color: '#000', fontSize: 16, fontWeight: 700,
            textDecoration: 'none',
            transition: 'transform 0.18s, opacity 0.18s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.03)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}
        >
          Launch Exchange →
        </Link>
        <p style={{ marginTop: 20, fontSize: 13, color: 'rgba(255,255,255,0.25)' }}>
          Sepolia testnet · No real funds required
        </p>

        {/* Footer */}
        <div style={{
          marginTop: 100,
          paddingTop: 32,
          borderTop: '1px solid rgba(255,255,255,0.07)',
          display: 'flex',
          justifyContent: 'center',
          gap: 48,
          color: 'rgba(255,255,255,0.2)',
          fontSize: 12,
          flexWrap: 'wrap' as const,
        }}>
          <span>ZeTheta Algorithms</span>
          <span>ZeTheta DEX</span>
          <span>Ethereum Sepolia Testnet</span>
          <span>Built with Next.js · LibP2P · Hardhat</span>
        </div>
      </section>
    </div>
  )
}
