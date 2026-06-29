#!/usr/bin/env bash
# ZeTheta DEX — Run all tests
set -euo pipefail

echo "==> Running smart contract tests..."
pnpm --filter @zetheta/contracts test

echo "==> Running frontend type-check..."
pnpm --filter dex-orderbook exec tsc --noEmit

echo "==> Running frontend lint..."
pnpm --filter dex-orderbook lint

echo ""
echo "All tests passed."
