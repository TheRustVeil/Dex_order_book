import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bid: '#00c77a',
        ask: '#f23645',
        bg: '#04060f',
        'bg-2': '#070c1a',
        card: '#080d1e',
        border: 'rgba(99,130,255,0.12)',
        muted: '#4a5568',
        accent: '#4f8ef7',
        'cyan': '#00d4ff',
        'purple': '#a855f7',
      },
      backgroundImage: {
        'grid': 'linear-gradient(rgba(79,142,247,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(79,142,247,0.04) 1px, transparent 1px)',
        'radial-glow': 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(79,142,247,0.15), transparent)',
      },
      backgroundSize: {
        'grid': '40px 40px',
      },
      boxShadow: {
        'neon-blue': '0 0 24px rgba(79,142,247,0.35)',
        'neon-cyan': '0 0 24px rgba(0,212,255,0.35)',
        'neon-green': '0 0 16px rgba(0,199,122,0.4)',
        'neon-red': '0 0 16px rgba(242,54,69,0.4)',
        'card': '0 4px 32px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)',
        'glow': '0 0 0 1px rgba(79,142,247,0.25), 0 0 24px rgba(79,142,247,0.12)',
        'modal': '0 24px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(79,142,247,0.15)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 6s ease-in-out infinite',
        'shimmer': 'shimmer 2.5s linear infinite',
        'border-glow': 'borderGlow 4s ease-in-out infinite',
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.4s cubic-bezier(0.16,1,0.3,1)',
        'spin-slow': 'spin 8s linear infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        borderGlow: {
          '0%, 100%': { borderColor: 'rgba(79,142,247,0.2)' },
          '50%': { borderColor: 'rgba(0,212,255,0.4)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px) scale(0.97)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      backdropBlur: {
        xs: '4px',
      },
    },
  },
  plugins: [],
}
export default config
