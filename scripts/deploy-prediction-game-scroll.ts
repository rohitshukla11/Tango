#!/usr/bin/env ts-node
/* eslint-disable no-console */
import fs from 'node:fs'
import path from 'path'
import solc from 'solc'
import { createWalletClient, http, createPublicClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { scrollSepolia } from 'viem/chains'

function requireEnv(name: string, fallback?: string) {
  const value = process.env[name] ?? fallback
  if (!value) throw new Error(`Missing env ${name}`)
  return value
}

function readContracts(): Record<string, { content: string }> {
  const dir = path.resolve(process.cwd(), 'contracts')
  const sources: Record<string, { content: string }> = {}

  const traverse = (rel: string) => {
    const full = path.join(dir, rel)
    const stat = fs.statSync(full)
    if (stat.isDirectory()) {
      for (const child of fs.readdirSync(full)) traverse(path.join(rel, child))
      return
    }
    if (rel.endsWith('.sol')) {
      sources[rel.replace(/\\/g, '/')] = { content: fs.readFileSync(full, 'utf8') }
    }
  }

  for (const entry of fs.readdirSync(dir)) traverse(entry)
  return sources
}

function compile(): Record<string, { abi: any[]; bytecode: `0x${string}` }> {
  const input = {
    language: 'Solidity',
    sources: readContracts(),
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode.object'],
        },
      },
    },
  }

  const output = JSON.parse(solc.compile(JSON.stringify(input)))
  if (output.errors) {
    const fatal = output.errors.filter((e: any) => e.severity === 'error')
    if (fatal.length) {
      for (const e of fatal) console.error(e.formattedMessage || e.message)
      throw new Error('Solc compilation failed')
    }
    for (const e of output.errors) console.warn(e.formattedMessage || e.message)
  }

  const compiled: Record<string, { abi: any[]; bytecode: `0x${string}` }> = {}
  for (const file of Object.keys(output.contracts)) {
    for (const name of Object.keys(output.contracts[file])) {
      const art = output.contracts[file][name]
      compiled[name] = {
        abi: art.abi,
        bytecode: ('0x' + art.evm.bytecode.object) as `0x${string}`,
      }
    }
  }

  return compiled
}

async function main() {
  const defaultRpc = 'https://sepolia-rpc.scroll.io'
  const RPC = requireEnv('SCROLL_RPC_URL', defaultRpc)
  const PK = requireEnv('SCROLL_PRIVATE_KEY')

  const account = privateKeyToAccount(`0x${PK.replace(/^0x/, '')}`)
  const client = createWalletClient({
    account,
    chain: scrollSepolia,
    transport: http(RPC),
  })
  
  const publicClient = createPublicClient({
    chain: scrollSepolia,
    transport: http(RPC),
  })

  console.log('📦 Compiling contracts...')
  const compiled = compile()

  const PredictionGameScroll = compiled['PredictionGameScroll']
  if (!PredictionGameScroll) {
    throw new Error('Missing compiled contract: PredictionGameScroll')
  }

  console.log('✅ Contracts compiled successfully')
  console.log('')
  console.log(`🚀 Deploying PredictionGameScroll to Scroll Sepolia...`)
  console.log(`   Deployer: ${account.address}`)
  console.log('')

  // Deploy PredictionGameScroll (no constructor args needed)
  const deployHash = await client.deployContract({
    abi: PredictionGameScroll.abi,
    bytecode: PredictionGameScroll.bytecode,
    args: [],
    account,
  })
  
  console.log(`⏳ Transaction hash: ${deployHash}`)
  console.log('   Waiting for confirmation...')
  
  const receipt = await client.waitForTransactionReceipt({ hash: deployHash })
  const contractAddress = receipt.contractAddress!
  
  console.log('')
  console.log('✅ PredictionGameScroll deployed successfully!')
  console.log(`   Address: ${contractAddress}`)
  console.log('')

  // Verify the contract is deployed and readable
  console.log('🔍 Verifying contract deployment...')
  try {
    const minStake = await publicClient.readContract({
      address: contractAddress,
      abi: PredictionGameScroll.abi,
      functionName: 'minStake',
    })
    console.log(`   ✅ Contract is readable`)
    console.log(`   ✅ minStake: ${minStake.toString()} wei (${Number(minStake) / 1e18} ETH)`)
  } catch (error) {
    console.warn('   ⚠️  Could not read contract (this might be normal if RPC is slow)')
  }

  console.log('')
  console.log('📝 Next steps:')
  console.log('1. Add the contract address to your .env.local:')
  console.log(`   NEXT_PUBLIC_PREDICTION_GAME_ADDRESS=${contractAddress}`)
  console.log('')
  console.log(`2. Verify the contract on Scroll Sepolia explorer:`)
  console.log(`   https://sepolia.scrollscan.com/address/${contractAddress}`)
  console.log('')
  console.log('3. Fund the contract (optional, for payouts):')
  console.log(`   Send ETH to ${contractAddress} to cover potential payouts (2x stake for perfect matches)`)
  console.log('')
  console.log('4. Test the contract:')
  console.log('   - Submit a prediction with commitment (hash of score + salt)')
  console.log('   - Reveal prediction after unlock block')
  console.log('   - Set AI score via setAIScore() after judging')
  console.log('   - Settle prediction via settlePrediction()')
  console.log('')

  // Save to config file
  const configPath = path.resolve(process.cwd(), 'src/config/contracts.json')
  let config: any = {}
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  }
  
  config.PredictionGameScroll = contractAddress
  config.network = 'scroll-sepolia'
  config.chainId = scrollSepolia.id
  
  fs.mkdirSync(path.dirname(configPath), { recursive: true })
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
  console.log(`💾 Saved to ${configPath}`)
}

main().catch((err) => {
  console.error('❌ Deployment failed:', err)
  process.exit(1)
})

