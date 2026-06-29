'use client'
import { useEffect, useRef } from 'react'
import { useDexStore } from '@/store/dex'
import type { CandleData } from '@/types'

// lightweight-charts is ESM-only; dynamic import avoids SSR issues
export function PriceChart() {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<unknown>(null)
  const seriesRef = useRef<unknown>(null)
  const { candles } = useDexStore()

  // Init chart once
  useEffect(() => {
    if (!containerRef.current) return
    let destroyed = false

    import('lightweight-charts').then(({ createChart, CrosshairMode }) => {
      if (destroyed || !containerRef.current) return

      const chart = createChart(containerRef.current, {
        layout: { background: { color: '#1a1f2e' }, textColor: '#9ca3af' },
        grid: { vertLines: { color: '#2d3748' }, horzLines: { color: '#2d3748' } },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: '#2d3748' },
        timeScale: { borderColor: '#2d3748', timeVisible: true, secondsVisible: true },
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      })

      const series = chart.addCandlestickSeries({
        upColor: '#16a34a',
        downColor: '#dc2626',
        borderUpColor: '#16a34a',
        borderDownColor: '#dc2626',
        wickUpColor: '#16a34a',
        wickDownColor: '#dc2626',
      })

      chartRef.current = chart
      seriesRef.current = series

      const ro = new ResizeObserver(() => {
        if (containerRef.current) {
          chart.applyOptions({
            width: containerRef.current.clientWidth,
            height: containerRef.current.clientHeight,
          })
        }
      })
      ro.observe(containerRef.current)

      return () => ro.disconnect()
    })

    return () => {
      destroyed = true
      if (chartRef.current) {
        (chartRef.current as { remove: () => void }).remove()
        chartRef.current = null
        seriesRef.current = null
      }
    }
  }, [])

  // Update candles
  useEffect(() => {
    if (!seriesRef.current || !candles.length) return
    const series = seriesRef.current as {
      setData: (d: { time: number; open: number; high: number; low: number; close: number }[]) => void
    }
    series.setData(
      candles.map((c: CandleData) => ({
        time: Math.floor(c.time / 1000) as unknown as number,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    )
  }, [candles])

  return <div ref={containerRef} className="w-full h-full" />
}
