const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  // standalone output and file tracing are expensive — only for production Docker builds
  ...(process.env.NODE_ENV === 'production' && {
    output: 'standalone',
    outputFileTracingRoot: path.join(__dirname, '../../'),
  }),
}

module.exports = nextConfig
