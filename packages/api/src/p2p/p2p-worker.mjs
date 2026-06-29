/**
 * ESM child-process bridge for DexP2PNode.
 * Spawned by p2p.service.ts via child_process.fork().
 * Communicates with the parent via IPC (process.send / process.on('message')).
 *
 * IPC in  → { type: 'START', config }
 *            { type: 'BROADCAST_ORDER', order }
 *            { type: 'BROADCAST_CANCEL', payload }
 *            { type: 'SHUTDOWN' }
 * IPC out ← { type: 'STARTED', peerId, addrs }
 *            { type: 'NEW_ORDER', order }
 *            { type: 'CANCEL_ORDER', payload }
 *            { type: 'ERROR', message }
 */

import { fileURLToPath, pathToFileURL } from 'url'
import path from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)

// Resolve the compiled p2p-network dist relative to this file.
// Must be a file:// URL — Windows absolute paths (D:\...) are not valid ESM specifiers.
const P2P_INDEX_PATH = path.join(__dirname, '..', '..', '..', 'p2p-network', 'dist', 'libp2p', 'index.js')
const P2P_INDEX = pathToFileURL(P2P_INDEX_PATH).href

const { DexP2PNode } = await import(P2P_INDEX)

let node = null

process.on('message', async (msg) => {
  try {
    if (msg.type === 'START') {
      // Strip any whitespace from bootstrap peers to avoid base58 parse errors
      const cleanConfig = {
        ...msg.config,
        bootstrapPeers: (msg.config.bootstrapPeers ?? []).map(s => s.trim()).filter(Boolean),
      }
      node = new DexP2PNode(cleanConfig)

      node.onNewOrder = (order) => {
        console.log(`[P2P] Received NEW_ORDER via gossipsub: ${order.id}`)
        process.send({ type: 'NEW_ORDER', order })
      }

      node.onCancelOrder = (payload) => {
        process.send({ type: 'CANCEL_ORDER', payload })
      }

      await node.start()
      const addrs = []
      try { addrs.push(...node['node']?.getMultiaddrs?.().map(a => a.toString()) ?? []) } catch {}
      process.send({ type: 'STARTED', peerId: node.peerId(), addrs })
    }

    if (msg.type === 'BROADCAST_ORDER' && node) {
      console.log(`[P2P] Broadcasting order ${msg.order.id} (${msg.order.side} ${msg.order.quantity} @ ${msg.order.price})`)
      await node.broadcastOrder(msg.order)
      console.log(`[P2P] Broadcast done for ${msg.order.id}`)
    }

    if (msg.type === 'BROADCAST_CANCEL' && node) {
      await node.broadcastCancel(msg.payload)
    }

    if (msg.type === 'GET_ADDRS' && node) {
      const ORDER_TOPIC = 'dex/orders/1.0.0'  // matches gossip.ts
      process.send({
        type: 'ADDRS',
        addrs: node.getAddrs(),
        peerId: node.peerId(),
        connectedPeers: node.getConnectedPeers(),
        orderTopicSubscribers: node.getTopicSubscribers(ORDER_TOPIC),
      })
    }

    if (msg.type === 'DIAL' && node) {
      await node.dialPeer(msg.multiaddr)
      process.send({ type: 'DIAL_OK', multiaddr: msg.multiaddr })
    }

    if (msg.type === 'SHUTDOWN') {
      if (node) await node.stop()
      process.exit(0)
    }
  } catch (err) {
    process.send({ type: 'ERROR', message: err?.message ?? String(err) })
  }
})
