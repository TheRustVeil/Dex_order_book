import { PubSub } from 'graphql-subscriptions'
import { orderBookService } from '../services/orderbook.service.js'
import type { PlaceOrderRequest } from '../types/index.js'

export const pubsub = new PubSub()

const SNAPSHOT_TOPIC = 'ORDER_BOOK_UPDATED'
const TRADE_TOPIC    = 'TRADE_EXECUTED'

// Wire service callbacks to PubSub
orderBookService.onSnapshot(snap => pubsub.publish(SNAPSHOT_TOPIC, { orderBookUpdated: snap }))
orderBookService.onTrade(trade => pubsub.publish(TRADE_TOPIC, { tradeExecuted: trade }))

export const resolvers = {
  Query: {
    orderBook: (_: unknown, { depth }: { pairId: string; depth?: number }) =>
      orderBookService.getSnapshot(depth ?? 15),

    orders: (_: unknown, { trader, status }: { trader: string; status?: string }) =>
      orderBookService.getTraderOrders(trader, status),

    order: (_: unknown, { id }: { id: string }) =>
      orderBookService.getOrder(id) ?? null,

    trades: (_: unknown, { pairId, limit }: { pairId?: string; limit?: number }) => {
      const all = orderBookService.getRecentTrades(limit ?? 50)
      return pairId ? all.filter(t => t.pairId === pairId) : all
    },

    stats: (_: unknown, { pairId }: { pairId: string }) =>
      orderBookService.get24hStats(pairId),
  },

  Mutation: {
    placeOrder: (_: unknown, args: PlaceOrderRequest) => {
      return orderBookService.placeOrder(args)
    },

    cancelOrder: (_: unknown, { id, trader }: { id: string; trader: string }) => {
      try {
        return orderBookService.cancelOrder(id, trader)
      } catch {
        return false
      }
    },
  },

  Subscription: {
    orderBookUpdated: {
      subscribe: () => pubsub.asyncIterableIterator([SNAPSHOT_TOPIC]),
    },
    tradeExecuted: {
      subscribe: () => pubsub.asyncIterableIterator([TRADE_TOPIC]),
    },
  },
}
