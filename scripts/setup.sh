#!/usr/bin/env bash
# ZeTheta DEX — Initial project setup
set -euo pipefail

echo "==> Installing pnpm (if not present)..."
npm install -g pnpm@11

echo "==> Installing all workspace dependencies..."
pnpm install --ignore-scripts

echo "==> Copying environment template..."
cp .env.example .env
echo "  !! Edit .env with your PRIVATE_KEY, SEPOLIA_RPC_URL, WALLETCONNECT_PROJECT_ID"

echo "==> Compiling smart contracts..."
pnpm --filter @zetheta/contracts compile

echo ""
echo "Setup complete. Run 'pnpm dev' to start the development server."
