-- ZeTheta DEX — PostgreSQL Schema
-- Run: psql $DATABASE_URL -f schema.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── orders ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trader       VARCHAR(42) NOT NULL,       -- Ethereum address (checksum)
  pair_id      VARCHAR(32) NOT NULL,       -- e.g. "WETH-USDC"
  side         VARCHAR(4)  NOT NULL CHECK (side IN ('buy','sell')),
  order_type   VARCHAR(10) NOT NULL CHECK (order_type IN ('limit','market')),
  price        NUMERIC(36,18) NOT NULL,
  quantity     NUMERIC(36,18) NOT NULL,
  filled       NUMERIC(36,18) NOT NULL DEFAULT 0,
  status       VARCHAR(12) NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open','filled','partial','cancelled')),
  nonce        BIGINT,
  expiry       BIGINT,                     -- unix timestamp seconds; 0 = no expiry
  signature    TEXT,                       -- EIP-712 hex signature
  on_chain_tx  VARCHAR(66),               -- tx hash when settled on-chain
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS orders_trader_idx   ON orders (trader);
CREATE INDEX IF NOT EXISTS orders_pair_idx     ON orders (pair_id);
CREATE INDEX IF NOT EXISTS orders_status_idx   ON orders (status);
CREATE INDEX IF NOT EXISTS orders_created_idx  ON orders (created_at DESC);

-- ── trades ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trades (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pair_id         VARCHAR(32) NOT NULL,
  maker_order_id  UUID        NOT NULL REFERENCES orders(id),
  taker_order_id  UUID        NOT NULL REFERENCES orders(id),
  price           NUMERIC(36,18) NOT NULL,
  quantity        NUMERIC(36,18) NOT NULL,
  side            VARCHAR(4)  NOT NULL CHECK (side IN ('buy','sell')),  -- taker side
  fee             NUMERIC(36,18) NOT NULL DEFAULT 0,
  tx_hash         VARCHAR(66),
  block_number    BIGINT,
  executed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS trades_pair_idx    ON trades (pair_id);
CREATE INDEX IF NOT EXISTS trades_exec_idx    ON trades (executed_at DESC);
CREATE INDEX IF NOT EXISTS trades_maker_idx   ON trades (maker_order_id);
CREATE INDEX IF NOT EXISTS trades_taker_idx   ON trades (taker_order_id);

-- ── orderbook_snapshots ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orderbook_snapshots (
  id          BIGSERIAL   PRIMARY KEY,
  pair_id     VARCHAR(32) NOT NULL,
  bids        JSONB       NOT NULL DEFAULT '[]',
  asks        JSONB       NOT NULL DEFAULT '[]',
  mid_price   NUMERIC(36,18),
  spread      NUMERIC(36,18),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS snapshots_pair_idx ON orderbook_snapshots (pair_id, captured_at DESC);

-- ── auto-update updated_at ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at ON orders;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
