'use client'

import { useEffect, useRef } from 'react'

interface Node {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  pulse: number
  pulseSpeed: number
  type: 'validator' | 'node' | 'hub'
}

interface BlockchainNodesProps {
  className?: string
  style?: React.CSSProperties
}

const TYPE_COLORS = {
  hub: { fill: 'rgba(0,212,255,ALPHA)', stroke: 'rgba(0,212,255,0.8)', glow: 'rgba(0,212,255,0.3)', r: 6 },
  validator: { fill: 'rgba(79,142,247,ALPHA)', stroke: 'rgba(79,142,247,0.8)', glow: 'rgba(79,142,247,0.25)', r: 4 },
  node: { fill: 'rgba(168,85,247,ALPHA)', stroke: 'rgba(168,85,247,0.6)', glow: 'rgba(168,85,247,0.2)', r: 3 },
}

export function BlockchainNodes({ className = '', style }: BlockchainNodesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let W = 0, H = 0
    const nodes: Node[] = []

    function resize() {
      W = canvas!.width  = canvas!.offsetWidth
      H = canvas!.height = canvas!.offsetHeight
      buildNodes()
    }

    function buildNodes() {
      nodes.length = 0
      const types: Array<Node['type']> = ['hub', 'hub', 'validator', 'validator', 'validator', 'node', 'node', 'node', 'node', 'node', 'node', 'node']
      types.forEach(t => {
        nodes.push({
          x: W * 0.1 + Math.random() * W * 0.8,
          y: H * 0.1 + Math.random() * H * 0.8,
          vx: (Math.random() - 0.5) * 0.3,
          vy: (Math.random() - 0.5) * 0.3,
          r: TYPE_COLORS[t].r,
          pulse: Math.random() * Math.PI * 2,
          pulseSpeed: 0.02 + Math.random() * 0.02,
          type: t,
        })
      })
    }

    const ro = new ResizeObserver(resize)
    resize()
    ro.observe(canvas)

    function draw() {
      ctx!.clearRect(0, 0, W, H)

      // Update positions
      nodes.forEach(n => {
        n.x += n.vx; n.y += n.vy
        n.pulse += n.pulseSpeed
        if (n.x < n.r || n.x > W - n.r) n.vx *= -1
        if (n.y < n.r || n.y > H - n.r) n.vy *= -1
      })

      // Draw connections
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j]
          const dx = a.x - b.x, dy = a.y - b.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          const maxD = Math.min(W, H) * 0.45

          if (dist < maxD) {
            const alpha = (1 - dist / maxD) * 0.35
            const grad = ctx!.createLinearGradient(a.x, a.y, b.x, b.y)
            const ca = TYPE_COLORS[a.type].stroke
            const cb = TYPE_COLORS[b.type].stroke
            grad.addColorStop(0, ca.replace('0.8', String(alpha)))
            grad.addColorStop(1, cb.replace('0.8', String(alpha)))
            ctx!.beginPath()
            ctx!.moveTo(a.x, a.y)
            ctx!.lineTo(b.x, b.y)
            ctx!.strokeStyle = grad
            ctx!.lineWidth = a.type === 'hub' || b.type === 'hub' ? 1.2 : 0.7
            ctx!.stroke()
          }
        }
      }

      // Draw nodes
      nodes.forEach(n => {
        const c = TYPE_COLORS[n.type]
        const pulse = Math.sin(n.pulse)
        const rNow = n.r + pulse * 1.2

        // Glow
        const grad = ctx!.createRadialGradient(n.x, n.y, 0, n.x, n.y, rNow * 4)
        grad.addColorStop(0, c.glow)
        grad.addColorStop(1, 'transparent')
        ctx!.beginPath()
        ctx!.arc(n.x, n.y, rNow * 4, 0, Math.PI * 2)
        ctx!.fillStyle = grad
        ctx!.fill()

        // Core
        ctx!.beginPath()
        ctx!.arc(n.x, n.y, rNow, 0, Math.PI * 2)
        ctx!.fillStyle = c.fill.replace('ALPHA', String(0.7 + pulse * 0.2))
        ctx!.strokeStyle = c.stroke
        ctx!.lineWidth = 1
        ctx!.fill()
        ctx!.stroke()

        // Inner bright dot for hubs
        if (n.type === 'hub') {
          ctx!.beginPath()
          ctx!.arc(n.x, n.y, rNow * 0.4, 0, Math.PI * 2)
          ctx!.fillStyle = 'rgba(255,255,255,0.9)'
          ctx!.fill()
        }
      })

      rafRef.current = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      cancelAnimationFrame(rafRef.current)
      ro.disconnect()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ display: 'block', width: '100%', height: '100%', ...style }}
    />
  )
}
