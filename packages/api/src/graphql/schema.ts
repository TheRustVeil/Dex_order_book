export const typeDefs = /* GraphQL */ `
  type PriceLevel {
    price: Float!
    quantity: Float!
    total: Float!
  }

  type OrderBookSnapshot {
    bids: [PriceLevel!]!
    asks: [PriceLevel!]!
    midPrice: Float
    spread: Float
    spreadPct: Float
  }

  type Order {
    id: String!
    trader: String!
    pairId: String!
    side: String!
    type: String!
    price: Float!
    quantity: Float!
    filled: Float!
    status: String!
    createdAt: Float!
    updatedAt: Float!
  }

  type Trade {
    id: String!
    pairId: String!
    makerOrderId: String!
    takerOrderId: String!
    price: Float!
    quantity: Float!
    side: String!
    fee: Float!
    timestamp: Float!
  }

  type Stats24h {
    pairId: String!
    volume: Float!
    high: Float!
    low: Float!
    open: Float!
    close: Float!
    tradeCount: Int!
  }

  type PlaceOrderResult {
    order: Order!
    trades: [Trade!]!
  }

  type Query {
    orderBook(pairId: String!, depth: Int): OrderBookSnapshot!
    orders(trader: String!, status: String): [Order!]!
    order(id: String!): Order
    trades(pairId: String, limit: Int): [Trade!]!
    stats(pairId: String!): Stats24h!
  }

  type Mutation {
    placeOrder(
      trader:    String!
      pairId:    String!
      side:      String!
      type:      String!
      price:     Float
      quantity:  Float!
      nonce:     Int
      expiry:    Int
      signature: String
    ): PlaceOrderResult!

    cancelOrder(id: String!, trader: String!): Boolean!
  }

  type Subscription {
    orderBookUpdated(pairId: String!): OrderBookSnapshot!
    tradeExecuted(pairId: String!): Trade!
  }
`
