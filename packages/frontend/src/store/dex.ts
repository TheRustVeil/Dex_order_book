import { create } from 'zustand'
import { OrderBookSnapshot, Trade, AMMPool, SpreadDataPoint, CandleData, LPPosition } from '@/types'

interface DexState {
  snapshot: OrderBookSnapshot | null
  trades: Trade[]
  ammPool: AMMPool | null
  spreadHistory: SpreadDataPoint[]
  candles: CandleData[]
  lpPosition: LPPosition | null
  connected: boolean
  lastOrderResult: string | null
  lastTxHash:      string | null   // most recent on-chain settlement tx
  wallet: string | null            // connected MetaMask address

  setSnapshot: (s: OrderBookSnapshot) => void
  setTrades: (t: Trade[]) => void
  setAmmPool: (p: AMMPool) => void
  setSpreadHistory: (h: SpreadDataPoint[]) => void
  setCandles: (c: CandleData[]) => void
  setConnected: (v: boolean) => void
  setLpPosition: (p: LPPosition | null) => void
  setLastOrderResult: (msg: string | null) => void
  setLastTxHash: (hash: string | null) => void
  setWallet: (address: string | null) => void
}

export const useDexStore = create<DexState>((set) => ({
  snapshot: null,
  trades: [],
  ammPool: null,
  spreadHistory: [],
  candles: [],
  lpPosition: null,
  connected: false,
  lastOrderResult: null,
  lastTxHash:      null,
  wallet: null,

  setSnapshot: (s) => set({ snapshot: s }),
  setTrades: (t) => set({ trades: t }),
  setAmmPool: (p) => set({ ammPool: p }),
  setSpreadHistory: (h) => set({ spreadHistory: h }),
  setCandles: (c) => set({ candles: c }),
  setConnected: (v) => set({ connected: v }),
  setLpPosition: (p) => set({ lpPosition: p }),
  setLastOrderResult: (msg) => set({ lastOrderResult: msg }),
  setLastTxHash: (hash) => set({ lastTxHash: hash }),
  setWallet: (address) => set({ wallet: address }),
}))
