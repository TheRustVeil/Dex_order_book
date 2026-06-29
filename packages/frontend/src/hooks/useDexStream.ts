'use client'
import { useEffect } from 'react'
import { useDexStore } from '@/store/dex'
import { OrderBookSnapshot, Trade, AMMPool, SpreadDataPoint, CandleData } from '@/types'
import { API_URL } from '@/lib/api'

export function useDexStream() {
  const { setSnapshot, setTrades, setAmmPool, setSpreadHistory, setCandles, setConnected } = useDexStore()

  useEffect(() => {
    let es: EventSource | null = null
    let retry: ReturnType<typeof setTimeout>

    function connect() {
      es = new EventSource(`${API_URL}/stream`)
      es.onopen = () => setConnected(true)
      es.onerror = () => {
        setConnected(false)
        es?.close()
        retry = setTimeout(connect, 3000)
      }
      es.onmessage = (e) => {
        try {
          const { type, data } = JSON.parse(e.data) as { type: string; data: unknown }
          if (type === 'snapshot') setSnapshot(data as OrderBookSnapshot)
          if (type === 'trades') setTrades(data as Trade[])
          if (type === 'amm') setAmmPool(data as AMMPool)
          if (type === 'spread') setSpreadHistory(data as SpreadDataPoint[])
          if (type === 'candles') setCandles(data as CandleData[])
        } catch {}
      }
    }

    connect()
    return () => { es?.close(); clearTimeout(retry) }
  }, [setSnapshot, setTrades, setAmmPool, setSpreadHistory, setCandles, setConnected])
}
