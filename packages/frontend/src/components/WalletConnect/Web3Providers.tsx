'use client'

// Thin provider wrapper — Web3 state is managed directly in WalletConnect via window.ethereum
export function Web3Providers({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
