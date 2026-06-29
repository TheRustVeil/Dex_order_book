'use client'

import { useId } from 'react'

/**
 * ZeTheta brand mark.
 * A theta (θ) ring in the brand gradient whose crossbar doubles as the
 * bid/ask spread line of an order book (bid-green → ask-cyan), on a dark
 * glassy tile. Scales crisply from favicon size up.
 */
export function ZeThetaLogo({ size = 26, className }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, '')
  const bg = `bg-${id}`
  const ring = `ring-${id}`
  const bar = `bar-${id}`
  const glow = `glow-${id}`

  return (
    <svg
      viewBox="0 0 28 28"
      fill="none"
      className={className}
      style={{ width: size, height: size, flexShrink: 0 }}
      aria-label="ZeTheta"
      role="img"
    >
      <defs>
        <linearGradient id={bg} x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#101a2e" />
          <stop offset="100%" stopColor="#0a1120" />
        </linearGradient>
        <linearGradient id={ring} x1="6" y1="6" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#4f8ef7" />
          <stop offset="100%" stopColor="#00d4ff" />
        </linearGradient>
        <linearGradient id={bar} x1="6.5" y1="14" x2="21.5" y2="14" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#22e0a1" />
          <stop offset="100%" stopColor="#00d4ff" />
        </linearGradient>
        <filter id={glow} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.7" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect width="28" height="28" rx="8" fill={`url(#${bg})`} />
      <rect x="0.6" y="0.6" width="26.8" height="26.8" rx="7.6" fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="1.1" />
      <g filter={`url(#${glow})`}>
        <circle cx="14" cy="14" r="7.1" fill="none" stroke={`url(#${ring})`} strokeWidth="2.4" />
        <rect x="6.6" y="12.85" width="14.8" height="2.3" rx="1.15" fill={`url(#${bar})`} />
      </g>
    </svg>
  )
}
