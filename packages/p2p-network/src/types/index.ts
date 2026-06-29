export type MessageType =
  | 'NEW_ORDER'
  | 'CANCEL_ORDER'
  | 'ORDER_FILL'
  | 'SYNC_REQUEST'
  | 'SYNC_RESPONSE'

export interface P2POrder {
  id: string
  pairId: string
  side: 'buy' | 'sell'
  orderType: 'limit' | 'market'
  price: number
  quantity: number
  trader: string       // wallet address
  nonce: number
  expiry: number       // 0 = no expiry
  signature: string    // EIP-712 signature
  timestamp: number
}

export interface P2PMessage {
  type: MessageType
  peerId: string
  payload: P2POrder | CancelPayload | FillPayload | SyncPayload
  timestamp: number
  msgId: string        // sha256(type + payload) — used for dedup
}

export interface CancelPayload {
  orderId: string
  signature: string
  deadline: number
}

export interface FillPayload {
  buyOrderId: string
  sellOrderId: string
  price: number
  quantity: number
  txHash?: string
}

export interface SyncPayload {
  fromTimestamp: number
  pairIds?: string[]
}

export interface P2PNodeConfig {
  listenAddrs: string[]           // e.g. ['/ip4/0.0.0.0/tcp/0', '/ip4/0.0.0.0/tcp/0/ws']
  announceAddrs?: string[]
  bootstrapPeers: string[]        // multiaddrs of known peers
  maxPeers?: number               // DOS: cap concurrent connections (default 50)
  rateLimit?: number              // DOS: max messages per peer per second (default 20)
}
