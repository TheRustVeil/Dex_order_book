#!/usr/bin/env node
/**
 * Update packages/subgraph/subgraph.yaml with addresses from a deployment JSON.
 *
 * Usage:
 *   node scripts/update-subgraph.js sepolia
 *   node scripts/update-subgraph.js hardhat
 *
 * Reads:  packages/contracts/deployments/<network>.json
 * Writes: packages/subgraph/subgraph.yaml  (address + startBlock fields)
 */

const fs   = require('fs')
const path = require('path')

const network = process.argv[2]
if (!network) {
  console.error('Usage: node scripts/update-subgraph.js <network>')
  process.exit(1)
}

const deploymentFile = path.join(
  __dirname, '..', 'packages', 'contracts', 'deployments', `${network}.json`
)
if (!fs.existsSync(deploymentFile)) {
  console.error(`Deployment file not found: ${deploymentFile}`)
  console.error(`Run: cd packages/contracts && npx hardhat run scripts/deploy.ts --network ${network}`)
  process.exit(1)
}

const deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'))
const { contracts } = deployment

const subgraphFile = path.join(__dirname, '..', 'packages', 'subgraph', 'subgraph.yaml')
let yaml = fs.readFileSync(subgraphFile, 'utf8')

// Map contract name → yaml datasource name
const replacements = [
  { name: 'OrderBook',  address: contracts.OrderBook  },
  { name: 'Settlement', address: contracts.Settlement },
]

let updated = yaml
let changes = 0

// Replace placeholder addresses per datasource block
for (const { name, address } of replacements) {
  if (!address || address === '0x0000000000000000000000000000000000000000') {
    console.warn(`  WARNING: ${name} address missing in deployment`)
    continue
  }

  // Match the datasource block by name, then replace its address field
  const pattern = new RegExp(
    `(    name: ${name}[\\s\\S]*?source:\\n      address: )"0x[0-9a-fA-F]{40}"`,
    'g'
  )
  const newYaml = updated.replace(pattern, `$1"${address}"`)
  if (newYaml !== updated) {
    updated = newYaml
    changes++
    console.log(`  ${name}: ${address}`)
  } else {
    console.warn(`  WARNING: Could not find address placeholder for ${name}`)
  }
}

// Set network to match deployment
const networkMapping = {
  sepolia:  'sepolia',
  mumbai:   'mumbai',
  hardhat:  'mainnet',   // Graph doesn't have hardhat — use mainnet for local testing
  ethereum: 'mainnet',
  polygon:  'matic',
  bsc:      'bsc',
  arbitrum: 'arbitrum-one',
}
const graphNetwork = networkMapping[network] || network
updated = updated.replace(/    network: \w[\w-]*/g, `    network: ${graphNetwork}`)

fs.writeFileSync(subgraphFile, updated, 'utf8')

console.log(`\nUpdated subgraph.yaml (${changes} address(es) replaced)`)
console.log('\nNext steps:')
console.log('  cd packages/subgraph')
console.log('  pnpm run codegen          # regenerate AssemblyScript bindings')
console.log('  pnpm run build            # compile mappings to WASM')
console.log(`  graph auth --studio $GRAPH_DEPLOY_KEY`)
console.log(`  graph deploy --studio $GRAPH_SUBGRAPH_NAME`)
