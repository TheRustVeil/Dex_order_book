import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { webSockets } from '@libp2p/websockets'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { gossipsub } from '@libp2p/gossipsub'
import { bootstrap } from '@libp2p/bootstrap'
import { identify } from '@libp2p/identify'
import { mdns } from '@libp2p/mdns'
import { kadDHT } from '@libp2p/kad-dht'
import type { Libp2p } from 'libp2p'
import type { GossipSub } from '@libp2p/gossipsub'
import type { KadDHT } from '@libp2p/kad-dht'

import {
  ORDER_TOPIC, CANCEL_TOPIC, FILL_TOPIC, SYNC_TOPIC,
  encodeMessage, decodeMessage,
  buildMsgId,
  validateOrder, validateCancel, validateFill,
} from '../protocols/gossip.js'
import { OrderStore } from '../storage/orderStore.js'
import type {
  P2PNodeConfig, P2PMessage, P2POrder,
  CancelPayload, FillPayload, SyncPayload,
} from '../types/index.js'

// DOS protection: messages per peer per second
const DEFAULT_MAX_PEERS  = 50
const DEFAULT_RATE_LIMIT = 20 // msgs/sec/peer

export class DexP2PNode {
  private node!: Libp2p
  private pubsub!: GossipSub
  private dht!: KadDHT
  private store = new OrderStore()
  private config: P2PNodeConfig

  // DOS: per-peer message counter reset each second
  private peerMsgCount: Map<string, number> = new Map()
  private rateLimitInterval?: ReturnType<typeof setInterval>

  // Callbacks
  onNewOrder?:    (order: P2POrder) => void
  onCancelOrder?: (payload: CancelPayload) => void
  onOrderFill?:   (payload: FillPayload) => void

  constructor(config: P2PNodeConfig) {
    this.config = config
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    const peerDiscovery = []
    if (this.config.bootstrapPeers.length > 0) {
      peerDiscovery.push(bootstrap({ list: this.config.bootstrapPeers }))
    }
    peerDiscovery.push(mdns())

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.node = await (createLibp2p as any)({
      addresses: {
        listen:   this.config.listenAddrs,
        announce: this.config.announceAddrs,
      },
      transports: [tcp(), webSockets()],
      connectionEncrypters: [noise()],
      streamMuxers: [yamux()],
      peerDiscovery,
      connectionManager: {
        maxConnections: this.config.maxPeers ?? DEFAULT_MAX_PEERS,
      },
      services: {
        pubsub:   gossipsub({
          allowPublishToZeroTopicPeers: true,
          emitSelf:                     false,
          floodPublish:                 true,  // send to all subscribers, not just mesh peers
          // tuned for small networks (2-node dev smoke test)
          D:   2,
          Dlo: 1,
          Dhi: 4,
          heartbeatInterval: 700,
        }),
        identify: identify(),
        // Kademlia DHT for peer routing and content routing
        dht: kadDHT({
          protocol:    '/zetheta-dex/kad/1.0.0',
          clientMode:  false, // act as server node (full DHT participant)
        }),
      },
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = this.node.services as any
    this.pubsub = svc.pubsub as GossipSub
    this.dht    = svc.dht    as KadDHT

    await this.node.start()
    await this._subscribeAll()
    this._startRateLimitReset()

    console.log('[P2P] Node started. PeerId:', this.node.peerId.toString())
    console.log('[P2P] Listening on:')
    this.node.getMultiaddrs().forEach(a => console.log(' ', a.toString()))
  }

  async stop(): Promise<void> {
    if (this.rateLimitInterval) clearInterval(this.rateLimitInterval)
    await this.node?.stop()
    console.log('[P2P] Node stopped.')
  }

  peerId(): string {
    return this.node.peerId.toString()
  }

  getAddrs(): string[] {
    return this.node.getMultiaddrs().map(a => a.toString())
  }

  getTopicSubscribers(topic: string): string[] {
    try {
      return this.pubsub.getSubscribers(topic).map(p => p.toString())
    } catch { return [] }
  }

  getConnectedPeers(): string[] {
    return this.node.getPeers().map(p => p.toString())
  }

  async dialPeer(ma: string): Promise<void> {
    const { multiaddr: maddr } = await import('@multiformats/multiaddr')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (this.node as any).dial(maddr(ma))
    console.log(`[P2P] Dialed: ${ma}`)
  }

  peers(): string[] {
    return this.node.getPeers().map(p => p.toString())
  }

  // ─── Kademlia DHT — content routing ──────────────────────────────────────

  /**
   * Announce to the DHT that this node has orders for a trading pair.
   * @param pairId  Trading pair identifier (e.g. "ETH-USDC")
   */
  async announcePair(_pairId: string): Promise<void> {
    // DHT content routing not wired in dev — gossipsub + mDNS handle discovery
  }

  async findPairPeers(_pairId: string): Promise<string[]> {
    return []
  }

  async dhtPut(_key: string, _value: Uint8Array): Promise<void> {
    // DHT not wired in dev
  }

  async dhtGet(_key: string): Promise<Uint8Array | null> {
    return null
  }

  // ─── GossipSub broadcast ─────────────────────────────────────────────────

  async broadcastOrder(order: P2POrder): Promise<void> {
    const err = validateOrder(order)
    if (err) throw new Error(`Invalid order: ${err}`)

    const msg: P2PMessage = {
      type:      'NEW_ORDER',
      peerId:    this.peerId(),
      payload:   order,
      timestamp: Date.now(),
      msgId:     buildMsgId('NEW_ORDER', order),
    }
    this.store.put(order)
    await this.pubsub.publish(ORDER_TOPIC, encodeMessage(msg))

    // Announce in the DHT that we have orders for this pair
    this.announcePair(order.pairId).catch(() => {})
  }

  async broadcastCancel(payload: CancelPayload): Promise<void> {
    const err = validateCancel(payload)
    if (err) throw new Error(`Invalid cancel: ${err}`)

    const msg: P2PMessage = {
      type:      'CANCEL_ORDER',
      peerId:    this.peerId(),
      payload,
      timestamp: Date.now(),
      msgId:     buildMsgId('CANCEL_ORDER', payload),
    }
    await this.pubsub.publish(CANCEL_TOPIC, encodeMessage(msg))
  }

  async broadcastFill(payload: FillPayload): Promise<void> {
    const err = validateFill(payload)
    if (err) throw new Error(`Invalid fill: ${err}`)

    const msg: P2PMessage = {
      type:      'ORDER_FILL',
      peerId:    this.peerId(),
      payload,
      timestamp: Date.now(),
      msgId:     buildMsgId('ORDER_FILL', payload),
    }
    await this.pubsub.publish(FILL_TOPIC, encodeMessage(msg))
  }

  async requestSync(payload: SyncPayload): Promise<void> {
    const msg: P2PMessage = {
      type:      'SYNC_REQUEST',
      peerId:    this.peerId(),
      payload,
      timestamp: Date.now(),
      msgId:     buildMsgId('SYNC_REQUEST', payload),
    }
    await this.pubsub.publish(SYNC_TOPIC, encodeMessage(msg))
  }

  // ─── Subscriptions ────────────────────────────────────────────────────────

  private async _subscribeAll(): Promise<void> {
    await this.pubsub.subscribe(ORDER_TOPIC)
    await this.pubsub.subscribe(CANCEL_TOPIC)
    await this.pubsub.subscribe(FILL_TOPIC)
    await this.pubsub.subscribe(SYNC_TOPIC)

    // Use the standard 'message' event (fires for subscribed topics only)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.pubsub.addEventListener('message', (evt: any) => {
      const msg = evt.detail
      this._handleInbound(msg.data, msg.from?.toString() ?? 'unknown', msg.topic)
    })
  }

  private _handleInbound(data: Uint8Array, fromPeer: string, topic: string): void {
    // DOS: rate limit per peer
    const count = (this.peerMsgCount.get(fromPeer) ?? 0) + 1
    this.peerMsgCount.set(fromPeer, count)
    const limit = this.config.rateLimit ?? DEFAULT_RATE_LIMIT
    if (count > limit) {
      console.warn(`[P2P] Rate limit exceeded for peer ${fromPeer} — dropping`)
      return
    }

    let msg: P2PMessage
    try {
      msg = decodeMessage(data)
    } catch {
      console.warn('[P2P] Failed to decode message from', fromPeer)
      return
    }

    // Duplicate detection
    if (this.store.hasSeen(msg.msgId)) return
    this.store.markSeen(msg.msgId)

    switch (topic) {
      case ORDER_TOPIC: {
        const order = msg.payload as P2POrder
        const err   = validateOrder(order)
        if (err) { console.warn('[P2P] Invalid order from', fromPeer, '—', err); return }
        this.store.put(order)
        this.onNewOrder?.(order)
        break
      }

      case CANCEL_TOPIC: {
        const payload = msg.payload as CancelPayload
        const err     = validateCancel(payload)
        if (err) { console.warn('[P2P] Invalid cancel from', fromPeer, '—', err); return }
        this.store.remove(payload.orderId)
        this.onCancelOrder?.(payload)
        break
      }

      case FILL_TOPIC: {
        const payload = msg.payload as FillPayload
        const err     = validateFill(payload)
        if (err) { console.warn('[P2P] Invalid fill from', fromPeer, '—', err); return }
        this.store.remove(payload.buyOrderId)
        this.store.remove(payload.sellOrderId)
        this.onOrderFill?.(payload)
        break
      }

      case SYNC_TOPIC: {
        const payload = msg.payload as SyncPayload
        const orders  = this.store.getSince(payload.fromTimestamp, payload.pairIds)
        orders.forEach(o => this.broadcastOrder(o).catch(() => {}))
        break
      }
    }
  }

  // Reset per-peer message counts each second
  private _startRateLimitReset(): void {
    this.rateLimitInterval = setInterval(() => this.peerMsgCount.clear(), 1_000)
  }

  // ─── Store access ────────────────────────────────────────────────────────

  getKnownOrders(): P2POrder[] {
    return this.store.getAll()
  }
}
