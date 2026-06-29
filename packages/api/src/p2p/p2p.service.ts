import { fork } from 'child_process'
import type { ChildProcess } from 'child_process'
import path from 'path'

// These mirror packages/p2p-network/src/types/index.ts — kept inline to avoid ESM import
export interface P2POrder {
  id:        string
  pairId:    string
  side:      'buy' | 'sell'
  orderType: 'limit' | 'market'
  price:     number
  quantity:  number
  trader:    string
  nonce:     number
  expiry:    number
  signature: string
  timestamp: number
}

interface CancelPayload {
  orderId:   string
  signature: string
  deadline:  number
}

interface WorkerMsg {
  type:     string
  peerId?:  string
  addrs?:   string[]
  order?:   P2POrder
  payload?: CancelPayload
  message?: string
}

const WORKER_PATH = path.join(__dirname, 'p2p-worker.mjs')

class P2PService {
  private child:              ChildProcess | null = null
  private newOrderCbs:        ((order: P2POrder) => void)[] = []
  private cancelCbs:          ((payload: CancelPayload) => void)[] = []
  private receivedFromP2P = new Set<string>()

  async start(opts: { listenPort?: number; bootstrapPeers?: string[] } = {}): Promise<void> {
    const tcp  = opts.listenPort ?? 6001
    const config = {
      listenAddrs:    [`/ip4/0.0.0.0/tcp/${tcp}`, `/ip4/0.0.0.0/tcp/${tcp + 1}/ws`],
      announceAddrs:  [],
      bootstrapPeers: opts.bootstrapPeers ?? [],
    }

    // Clear ts-node hooks from child so it runs as clean ESM
    const env = { ...process.env, NODE_OPTIONS: '' }

    this.child = fork(WORKER_PATH, [], { stdio: ['pipe', 'pipe', 'pipe', 'ipc'], env })

    this.child.stdout?.on('data', d => process.stdout.write('[P2P] ' + d))
    this.child.stderr?.on('data', d => process.stderr.write('[P2P] ' + d))

    this.child.on('message', (raw: unknown) => {
      const msg = raw as WorkerMsg
      switch (msg.type) {
        case 'NEW_ORDER':
          if (msg.order) {
            this.receivedFromP2P.add(msg.order.id)
            this.newOrderCbs.forEach(cb => cb(msg.order!))
          }
          break
        case 'CANCEL_ORDER':
          if (msg.payload) this.cancelCbs.forEach(cb => cb(msg.payload!))
          break
        case 'ERROR':
          console.error('[P2P] Worker error:', msg.message)
          break
      }
    })

    // Wait for STARTED
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('P2P start timeout after 15s')), 15_000)
      this.child!.on('message', (raw: unknown) => {
        const msg = raw as WorkerMsg
        if (msg.type === 'STARTED') {
          clearTimeout(timer)
          console.log(`[P2P] Node ready. PeerId: ${msg.peerId}`)
          if (msg.addrs?.length) msg.addrs.forEach(a => console.log(`[P2P]  → ${a}`))
          resolve()
        }
        if (msg.type === 'ERROR') {
          clearTimeout(timer)
          reject(new Error(`P2P start failed: ${msg.message}`))
        }
      })
      this.child!.send({ type: 'START', config })
    })
  }

  broadcastOrder(order: P2POrder): void {
    if (!this.child || this.receivedFromP2P.has(order.id)) return
    this.child.send({ type: 'BROADCAST_ORDER', order })
  }

  broadcastCancel(orderId: string): void {
    if (!this.child) return
    const payload: CancelPayload = {
      orderId,
      signature: '0x0',
      deadline:  Math.floor(Date.now() / 1000) + 3_600,
    }
    this.child.send({ type: 'BROADCAST_CANCEL', payload })
  }

  isFromP2P(orderId: string): boolean {
    return this.receivedFromP2P.has(orderId)
  }

  getAddrs(): Promise<{ peerId: string; addrs: string[]; connectedPeers?: string[]; orderTopicSubscribers?: string[] }> {
    return new Promise((resolve, reject) => {
      if (!this.child) return reject(new Error('P2P not started'))
      const timer = setTimeout(() => reject(new Error('getAddrs timeout')), 5_000)
      const handler = (raw: unknown) => {
        const msg = raw as { type: string; peerId?: string; addrs?: string[]; connectedPeers?: string[]; orderTopicSubscribers?: string[] }
        if (msg.type === 'ADDRS') {
          clearTimeout(timer)
          this.child!.off('message', handler)
          resolve({ peerId: msg.peerId ?? '', addrs: msg.addrs ?? [], connectedPeers: msg.connectedPeers, orderTopicSubscribers: msg.orderTopicSubscribers })
        }
        if (msg.type === 'ERROR') {
          clearTimeout(timer)
          this.child!.off('message', handler)
          reject(new Error((msg as { message?: string }).message ?? 'getAddrs error'))
        }
      }
      this.child.on('message', handler)
      this.child.send({ type: 'GET_ADDRS' })
    })
  }

  dialPeer(ma: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.child) return reject(new Error('P2P not started'))
      const timer = setTimeout(() => reject(new Error('dial timeout')), 10_000)
      const handler = (raw: unknown) => {
        const msg = raw as { type: string; message?: string }
        if (msg.type === 'DIAL_OK') { clearTimeout(timer); this.child!.off('message', handler); resolve() }
        if (msg.type === 'ERROR')   { clearTimeout(timer); this.child!.off('message', handler); reject(new Error(msg.message)) }
      }
      this.child.on('message', handler)
      this.child.send({ type: 'DIAL', multiaddr: ma })
    })
  }

  onNewOrder(cb: (order: P2POrder) => void): void    { this.newOrderCbs.push(cb) }
  onCancelOrder(cb: (p: CancelPayload) => void): void { this.cancelCbs.push(cb) }

  async stop(): Promise<void> {
    this.child?.send({ type: 'SHUTDOWN' })
    await new Promise<void>(r => setTimeout(r, 1_000))
    this.child?.kill()
    this.child = null
  }
}

export const p2pService = new P2PService()
