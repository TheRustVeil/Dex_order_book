const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  // standalone output + file tracing are only needed for the self-hosted Docker image.
  // Opt in explicitly via BUILD_STANDALONE=1 (set in Dockerfile.frontend) so that
  // platform deploys like Vercel use the default Next.js output instead.
  ...(process.env.BUILD_STANDALONE === '1' && {
    output: 'standalone',
    outputFileTracingRoot: path.join(__dirname, '../../'),
  }),
}

module.exports = nextConfig
