'use client'

import { useEffect, useState } from 'react'

// Extend JSX to allow <spline-viewer> custom element
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'spline-viewer': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & { url: string; 'loading-anim'?: string },
        HTMLElement
      >
    }
  }
}

interface SplineSceneProps {
  url: string
  className?: string
  style?: React.CSSProperties
}

// Client-only Spline viewer (avoids SSR hydration mismatch with custom elements)
export function SplineScene({ url, className = '', style }: SplineSceneProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div
        className={`${className} flex items-center justify-center`}
        style={style}
      >
        <div className="w-8 h-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
      </div>
    )
  }

  return (
    <div className={className} style={style}>
      <spline-viewer url={url} loading-anim="true" />
    </div>
  )
}
