import Fastify from 'fastify'
import cors from '@fastify/cors'
import fastifyWebSocket from '@fastify/websocket'
import { ApolloServer, HeaderMap } from '@apollo/server'
import { makeExecutableSchema } from '@graphql-tools/schema'
import { Server as SocketIOServer } from 'socket.io'
import { createServer } from 'http'

import { typeDefs }  from './graphql/schema.js'
import { resolvers } from './graphql/resolvers.js'
import { ordersRoutes }    from './routes/orders.js'
import { orderbookRoutes } from './routes/orderbook.js'
import { tradesRoutes }    from './routes/trades.js'
import { streamRoutes }    from './routes/stream.js'
import { ammRoutes }       from './routes/amm.js'
import { orderBookService } from './services/orderbook.service.js'
import { simulationService } from './services/simulation.service.js'
import { p2pService } from './p2p/p2p.service.js'
import { registry, httpRequestDuration, wsClients } from './metrics/prometheus.js'

const PORT = parseInt(process.env.PORT ?? '3001', 10)

// Per-wallet Socket.IO room name
const walletRoom = (wallet: string) => `wallet:${wallet.toLowerCase()}`

async function bootstrap(): Promise<void> {
  const app = Fastify({ logger: true })

  await app.register(cors, { origin: '*' })
  await app.register(fastifyWebSocket)

  // ── Prometheus request timing ────────────────────────────────────────────

  app.addHook('onRequest', async (req) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(req as any)._reqStart = Date.now()
  })
  app.addHook('onResponse', async (req, reply) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const start = (req as any)._reqStart as number | undefined
    if (start) {
      const duration = (Date.now() - start) / 1000
      httpRequestDuration
        .labels(req.method, req.routeOptions?.url ?? req.url, String(reply.statusCode))
        .observe(duration)
    }
  })

  // ── REST routes ──────────────────────────────────────────────────────────

  await app.register(ordersRoutes)
  await app.register(orderbookRoutes)
  await app.register(tradesRoutes)
  await app.register(streamRoutes)
  await app.register(ammRoutes)

  // ── GraphQL (Apollo) ─────────────────────────────────────────────────────

  const schema = makeExecutableSchema({ typeDefs, resolvers })
  const apollo = new ApolloServer({ schema })
  await apollo.start()

  app.post('/graphql', async (req, reply) => {
    const { body, headers } = req
    const result = await apollo.executeHTTPGraphQLRequest({
      httpGraphQLRequest: {
        method:  'POST',
        headers: new HeaderMap(Object.entries(headers as Record<string, string>)),
        body,
        search:  '',
      },
      context: async () => ({ req, reply }),
    })

    if (result.body.kind === 'complete') {
      return reply
        .status(result.status ?? 200)
        .header('content-type', 'application/json')
        .send(result.body.string)
    }

    return reply.status(500).send({ error: 'Unexpected streaming response' })
  })

  app.get('/graphql', async (req, reply) => {
    const result = await apollo.executeHTTPGraphQLRequest({
      httpGraphQLRequest: {
        method:  'GET',
        headers: new HeaderMap(Object.entries(req.headers as Record<string, string>)),
        search:  req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '',
        body:    undefined,
      },
      context: async () => ({ req, reply }),
    })
    if (result.body.kind === 'complete') {
      return reply
        .status(result.status ?? 200)
        .header('content-type', 'application/json')
        .send(result.body.string)
    }
    return reply.status(500).send({ error: 'Unexpected streaming response' })
  })

  // ── Socket.IO real-time feed ─────────────────────────────────────────────

  const httpServer = createServer(app.server)
  const io = new SocketIOServer(httpServer, { cors: { origin: '*' } })

  io.on('connection', socket => {
    wsClients.inc()
    app.log.info({ socketId: socket.id }, 'Socket.IO client connected')

    // Send current snapshot on connection
    socket.emit('orderbook:snapshot', orderBookService.getSnapshot())

    // ── Global subscriptions ─────────────────────────────────────────────

    socket.on('subscribe:orderbook', () => {
      socket.emit('orderbook:snapshot', orderBookService.getSnapshot())
    })

    // ── Per-wallet room — user-specific order status updates ─────────────
    // Client sends: { wallet: "0xabc..." }
    // Server joins the socket to room "wallet:0xabc..."
    // All status changes for that wallet are pushed only to that room.

    socket.on('subscribe:wallet', ({ wallet }: { wallet: string }) => {
      if (!wallet || typeof wallet !== 'string') return
      const room = walletRoom(wallet)
      socket.join(room)
      app.log.info({ socketId: socket.id, wallet, room }, 'Joined wallet room')

      // Send the user's current open orders immediately
      const openOrders = orderBookService.getTraderOrders(wallet)
      socket.emit('orders:open', openOrders)
    })

    socket.on('unsubscribe:wallet', ({ wallet }: { wallet: string }) => {
      if (!wallet) return
      socket.leave(walletRoom(wallet))
    })

    socket.on('disconnect', () => {
      wsClients.dec()
      app.log.info({ socketId: socket.id }, 'Socket.IO client disconnected')
    })
  })

  // ── Broadcast real-time events ───────────────────────────────────────────

  // Global feeds
  orderBookService.onSnapshot(snap => io.emit('orderbook:snapshot', snap))
  orderBookService.onTrade(trade  => io.emit('trade:executed', trade))

  // Per-wallet order status updates: pushed only to the wallet's room
  orderBookService.onOrderUpdate((wallet, order) => {
    io.to(walletRoom(wallet)).emit('order:update', order)
  })

  // ── Health check + Prometheus metrics ────────────────────────────────────

  app.get('/health', async () => ({ status: 'ok', timestamp: Date.now() }))

  app.get('/metrics', async (_req, reply) => {
    const metrics = await registry.metrics()
    return reply.header('content-type', registry.contentType).send(metrics)
  })

  // ── P2P routes (registered before listen so Fastify accepts them) ─────────

  app.get('/p2p/status', async () => {
    try {
      const info = await p2pService.getAddrs()
      return { p2p: true, ...info }
    } catch { return { p2p: false } }
  })

  app.post('/p2p/dial', async (req, reply) => {
    const { multiaddr: ma } = req.body as { multiaddr?: string }
    if (!ma) return reply.status(400).send({ error: 'multiaddr required' })
    try {
      await p2pService.dialPeer(ma)
      return { ok: true, dialed: ma }
    } catch (err) {
      return reply.status(500).send({ error: (err as Error).message })
    }
  })

  // ── Start ────────────────────────────────────────────────────────────────

  await app.listen({ port: PORT, host: '0.0.0.0' })

  // Simulation is a singleton started on first import; log reference to silence the lint warning
  void simulationService

  console.log(`[API] REST:   http://localhost:${PORT}`)
  console.log(`[API] GQL:    http://localhost:${PORT}/graphql`)
  console.log(`[API] WS:     ws://localhost:${PORT}`)
  console.log(`[API] SSE:    http://localhost:${PORT}/stream`)
  console.log(`[API] Wallet rooms: emit subscribe:wallet with {wallet:"0x..."}`)

  // ── P2P network ──────────────────────────────────────────────────────────

  const P2P_PORT       = parseInt(process.env.P2P_PORT ?? '6001', 10)
  const P2P_BOOTSTRAP  = (process.env.P2P_BOOTSTRAP ?? '').split(',').filter(Boolean)
  const P2P_ENABLED    = process.env.P2P_ENABLED !== '0'

  if (P2P_ENABLED) {
    try {
      await p2pService.start({ listenPort: P2P_PORT, bootstrapPeers: P2P_BOOTSTRAP })

      // Inbound P2P order → place in local matching engine (no persist, no re-broadcast)
      p2pService.onNewOrder(p2pOrder => {
        try {
          orderBookService.placeOrder({
            id:        p2pOrder.id,
            trader:    p2pOrder.trader,
            side:      p2pOrder.side,
            type:      p2pOrder.orderType,
            price:     p2pOrder.price,
            quantity:  p2pOrder.quantity,
            pairId:    p2pOrder.pairId,
            nonce:     p2pOrder.nonce,
            expiry:    p2pOrder.expiry,
            signature: p2pOrder.signature,
            p2pOrigin: true,
          })
        } catch (err) {
          app.log.warn({ err }, '[P2P] Failed to apply inbound order')
        }
      })

      // Outbound: broadcast every locally-placed user order via P2P
      orderBookService.onOrderPlaced(order => {
        if (p2pService.isFromP2P(order.id)) return
        p2pService.broadcastOrder({
          id:        order.id,
          pairId:    order.pairId,
          side:      order.side,
          orderType: order.type,
          price:     order.price,
          quantity:  order.quantity,
          trader:    order.trader,
          nonce:     order.nonce ?? 0,
          expiry:    order.expiry ?? 0,
          signature: order.signature ?? '0x0',
          timestamp: order.createdAt,
        })
      })

      console.log(`[API] P2P:    listening on tcp/${P2P_PORT}, ws/${P2P_PORT + 1}`)
    } catch (err) {
      console.error('[P2P] Failed to start — continuing without P2P:', (err as Error).message)
    }
  }
}

bootstrap().catch(err => {
  console.error(err)
  process.exit(1)
})
