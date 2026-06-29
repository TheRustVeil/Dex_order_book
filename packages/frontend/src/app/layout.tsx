import type { Metadata } from 'next'
import './globals.css'
import { Web3Providers } from '@/components/WalletConnect/Web3Providers'

export const metadata: Metadata = {
  title: 'ZeTheta DEX — Order Book',
  description: 'Advanced decentralized exchange order book with hybrid AMM routing by ZeTheta Algorithms',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Web3Providers>{children}</Web3Providers>
      </body>
    </html>
  )
}
