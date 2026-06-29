#!/usr/bin/env bash
# ZeTheta DEX — Deploy contracts and frontend
set -euo pipefail

NETWORK="${1:-sepolia}"

echo "==> Deploying contracts to $NETWORK..."
pnpm --filter @zetheta/contracts "deploy:$NETWORK"

echo "==> Building frontend..."
pnpm --filter dex-orderbook build

echo "==> Deployment complete for network: $NETWORK"
