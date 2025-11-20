/**
 * Scroll-compatible prediction hook using commit-reveal pattern
 * No BlockLock dependency - uses keccak256(score + salt) commitments
 */

import { useCallback, useMemo, useState } from 'react'
import { ethers } from 'ethers'
import { useAccount } from 'wagmi'
import { scrollSepolia } from 'wagmi/chains'
import { keccak256, toUtf8Bytes, encodePacked } from 'viem'

// Contract ABI for PredictionGameScroll
const PREDICTION_GAME_SCROLL_ABI = [
  {
    name: 'submitPrediction',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'entryId', type: 'uint256' },
      { name: 'videoCid', type: 'string' },
      { name: 'commitment', type: 'bytes32' },
      { name: 'unlockBlock', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'revealPrediction',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'entryId', type: 'uint256' },
      { name: 'scoreScaled', type: 'uint16' },
      { name: 'salt', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    name: 'settlePrediction',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'entryId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'setAIScore',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'entryId', type: 'uint256' },
      { name: 'aiScoreScaled', type: 'uint16' },
    ],
    outputs: [],
  },
  {
    name: 'minStake',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'predictions',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'entryId', type: 'uint256' }],
    outputs: [
      { name: 'predictor', type: 'address' },
      { name: 'amountStaked', type: 'uint256' },
      { name: 'unlockBlock', type: 'uint256' },
      { name: 'commitment', type: 'bytes32' },
      { name: 'revealed', type: 'bool' },
      { name: 'settled', type: 'bool' },
      { name: 'revealedScore', type: 'uint16' },
    ],
  },
  {
    name: 'aiScores',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'entryId', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint16' }],
  },
  {
    name: 'computeCommitment',
    type: 'function',
    stateMutability: 'pure',
    inputs: [
      { name: 'scoreScaled', type: 'uint16' },
      { name: 'salt', type: 'bytes32' },
    ],
    outputs: [{ name: 'commitment', type: 'bytes32' }],
  },
] as const

const SCROLL_RPC = process.env.NEXT_PUBLIC_STAKING_RPC_URL || 'https://sepolia-rpc.scroll.io'
const SCROLL_EXPLORER = process.env.NEXT_PUBLIC_STAKING_EXPLORER_URL || 'https://sepolia.scrollscan.com'

export interface ScrollPredictionParams {
  entryId: number
  videoCid: string
  predictedScore: number
  estimatedJudgingMinutes?: number
  stakeAmountEth?: string
  salt?: string
}

export interface ScrollPredictionResult {
  success: boolean
  unlockBlock?: bigint
  stakeWei?: bigint
  totalValueWei?: bigint
  transactionHash?: string
  commitment?: string
  salt?: string
  error?: string
}

export interface ScrollPredictionCostEstimate {
  total: bigint
  stake: bigint
  minStake: bigint
  unlockBlock: bigint
  error?: string
}

export interface UseScrollPredictionConfig {
  predictionContractAddress?: `0x${string}`
}

function getEthereumProvider() {
  if (typeof window === 'undefined') throw new Error('Wallet not available in SSR')
  const ethereum = (window as any).ethereum
  if (!ethereum) throw new Error('Injected wallet provider not found. Please open MetaMask and try again.')
  return ethereum
}

async function ensureScrollChain() {
  const ethereum = getEthereumProvider()
  const scrollSepoliaChainId = `0x${scrollSepolia.id.toString(16)}`
  
  try {
    await ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: scrollSepoliaChainId }],
    })
  } catch (error: any) {
    if (error?.code === 4902) {
      await ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: scrollSepoliaChainId,
            chainName: 'Scroll Sepolia',
            rpcUrls: [SCROLL_RPC],
            blockExplorerUrls: [SCROLL_EXPLORER],
            nativeCurrency: { 
              name: 'ETH', 
              symbol: 'ETH', 
              decimals: 18 
            },
          },
        ],
      })
    } else {
      throw new Error(`Please switch your wallet to Scroll Sepolia and try again.`)
    }
  }
}

function generateSalt(): string {
  const randomBytes = new Uint8Array(32)
  crypto.getRandomValues(randomBytes)
  return `0x${Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('')}`
}

function computeCommitment(scoreScaled: number, salt: string): string {
  // keccak256(abi.encodePacked(scoreScaled, salt))
  const packed = encodePacked(
    ['uint16', 'bytes32'],
    [scoreScaled as number, salt as `0x${string}`]
  )
  return keccak256(packed)
}

export function useScrollPrediction(config?: UseScrollPredictionConfig) {
  const { address, isConnected } = useAccount()
  
  const [status, setStatus] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const predictionGameAddress = useMemo(
    () =>
      config?.predictionContractAddress ??
      (process.env.NEXT_PUBLIC_PREDICTION_GAME_ADDRESS as `0x${string}` | undefined),
    [config?.predictionContractAddress],
  )

  const estimatePredictionCost = useCallback(
    async (estimatedMinutes = 1, stakeEth?: string): Promise<ScrollPredictionCostEstimate | null> => {
      if (!predictionGameAddress) {
        console.error('[Scroll] Prediction contract address missing')
        return null
      }

      try {
        await ensureScrollChain()
        
        const ethereum = getEthereumProvider()
        const provider = new ethers.BrowserProvider(ethereum)
        const jsonProvider = new ethers.JsonRpcProvider(SCROLL_RPC)
        
        const currentBlockNumber = await jsonProvider.getBlockNumber()
        const blocksToAdd = Math.max(40, Math.ceil((estimatedMinutes * 60) / 2)) // ~2 sec per block
        const unlockBlock = BigInt(currentBlockNumber + blocksToAdd)

        const contract = new ethers.Contract(predictionGameAddress, PREDICTION_GAME_SCROLL_ABI, provider)
        
        let minStake: bigint
        try {
          minStake = await contract.minStake()
        } catch (error) {
          console.warn('[Scroll] Unable to read minStake. Defaulting to 1 wei.', error)
          minStake = BigInt(1)
        }

        const stake = stakeEth ? ethers.parseEther(stakeEth.trim()) : ethers.parseEther('0.001')
        const stakeToUse = stake < minStake ? minStake : stake

        return {
          total: stakeToUse,
          stake: stakeToUse,
          minStake,
          unlockBlock,
        }
      } catch (error: any) {
        console.error('[Scroll] Cost estimation failed:', error)
        return null
      }
    },
    [predictionGameAddress],
  )

  const submitPrediction = useCallback(
    async ({
      entryId,
      videoCid,
      predictedScore,
      estimatedJudgingMinutes = 1,
      stakeAmountEth,
      salt,
    }: ScrollPredictionParams): Promise<ScrollPredictionResult> => {
      if (!predictionGameAddress) {
        return { success: false, error: 'Prediction contract address missing.' }
      }
      if (!isConnected || !address) {
        return { success: false, error: 'Wallet not connected.' }
      }
      if (!videoCid?.trim()) {
        return { success: false, error: 'Video CID is required.' }
      }

      setIsSubmitting(true)
      setStatus('🔄 Preparing Scroll prediction…')

      try {
        await ensureScrollChain()
        setStatus('✅ Connected to Scroll Sepolia')

        const ethereum = getEthereumProvider()
        const provider = new ethers.BrowserProvider(ethereum)
        const jsonProvider = new ethers.JsonRpcProvider(SCROLL_RPC)
        const signer = await provider.getSigner()

        const contract = new ethers.Contract(predictionGameAddress, PREDICTION_GAME_SCROLL_ABI, signer)

        setStatus('📦 Reading blockchain state…')
        
        const currentBlockNumber = await jsonProvider.getBlockNumber()
        const blocksToAdd = Math.max(40, Math.ceil((estimatedJudgingMinutes * 60) / 2))
        const unlockBlock = BigInt(currentBlockNumber + blocksToAdd)

        try {
          const existingPrediction = await contract.predictions(BigInt(entryId))
          if (existingPrediction.predictor && existingPrediction.predictor !== ethers.ZeroAddress) {
            return { 
              success: false, 
              error: `Prediction already exists for entry ${entryId}. Predictor: ${existingPrediction.predictor}` 
            }
          }
        } catch (error) {
          console.warn('[Scroll] Could not check for existing prediction:', error)
        }

        setStatus('🔐 Computing commitment…')
        
        const scaledScore = Math.round(predictedScore * 100)
        const predictionSalt = salt || generateSalt()
        const commitment = computeCommitment(scaledScore, predictionSalt)

        setStatus('💰 Calculating costs…')
        
        let minStake: bigint
        try {
          minStake = await contract.minStake()
        } catch (error) {
          console.warn('[Scroll] Unable to read minStake. Defaulting to 1 wei.', error)
          minStake = BigInt(1)
        }

        const stake = stakeAmountEth ? ethers.parseEther(stakeAmountEth.trim()) : ethers.parseEther('0.001')
        const stakeToUse = stake < minStake ? minStake : stake

        const balance = await provider.getBalance(address)
        if (balance < stakeToUse) {
          return {
            success: false,
            error: `Insufficient balance. Need ${ethers.formatEther(stakeToUse)} ETH.`,
          }
        }

        setStatus('🚀 Submitting prediction to contract…')
        
        const tx = await contract.submitPrediction(
          BigInt(entryId),
          videoCid.trim(),
          commitment,
          unlockBlock,
          { value: stakeToUse }
        )

        if (!tx || !tx.hash) {
          throw new Error('Transaction hash not returned')
        }

        setStatus('⏳ Waiting for confirmation…')
        
        const receipt = await tx.wait(1)
        
        if (!receipt) {
          throw new Error('Transaction has not been mined')
        }

        if (receipt.status !== 1) {
          throw new Error('Transaction failed')
        }

        setStatus('✅ Prediction submitted!')
        setIsSubmitting(false)

        return {
          success: true,
          transactionHash: receipt.hash,
          unlockBlock,
          stakeWei: stakeToUse,
          totalValueWei: stakeToUse,
          commitment,
          salt: predictionSalt,
        }
      } catch (error: any) {
        console.error('[Scroll] Prediction submission failed:', error)
        
        let errorMessage = 'Prediction submission failed.'
        
        if (error.message) {
          errorMessage = error.message
        } else if (error.reason) {
          errorMessage = error.reason
        } else if (error.data?.message) {
          errorMessage = error.data.message
        }
        
        setStatus('❌ ' + errorMessage)
        setIsSubmitting(false)
        
        return {
          success: false,
          error: errorMessage,
        }
      }
    },
    [address, isConnected, predictionGameAddress],
  )

  const revealPrediction = useCallback(
    async (entryId: number, scoreScaled: number, salt: string) => {
      if (!predictionGameAddress) {
        throw new Error('Prediction contract address missing.')
      }
      if (!isConnected || !address) {
        throw new Error('Wallet not connected.')
      }

      setStatus('⏳ Revealing prediction…')
      setIsSubmitting(true)

      try {
        await ensureScrollChain()
        
        const ethereum = getEthereumProvider()
        const provider = new ethers.BrowserProvider(ethereum)
        const signer = await provider.getSigner()
        
        const contract = new ethers.Contract(predictionGameAddress, PREDICTION_GAME_SCROLL_ABI, signer)
        
        const tx = await contract.revealPrediction(
          BigInt(entryId),
          scoreScaled,
          salt
        )
        
        if (!tx) {
          throw new Error('Failed to send reveal transaction.')
        }

        setStatus('⏳ Waiting for confirmation…')
        await tx.wait(1)
        
        setStatus('✅ Prediction revealed!')
      } catch (error: any) {
        console.error('[Scroll] Reveal prediction failed:', error)
        const errorMessage = error?.message ?? error?.reason ?? 'Reveal failed.'
        setStatus('❌ ' + errorMessage)
        throw error
      } finally {
        setIsSubmitting(false)
      }
    },
    [address, isConnected, predictionGameAddress],
  )

  const settlePrediction = useCallback(
    async (entryId: number) => {
      if (!predictionGameAddress) {
        throw new Error('Prediction contract address missing.')
      }
      if (!isConnected || !address) {
        throw new Error('Wallet not connected.')
      }

      setStatus('⏳ Settling prediction…')
      setIsSubmitting(true)

      try {
        await ensureScrollChain()
        
        const ethereum = getEthereumProvider()
        const provider = new ethers.BrowserProvider(ethereum)
        const signer = await provider.getSigner()
        
        const contract = new ethers.Contract(predictionGameAddress, PREDICTION_GAME_SCROLL_ABI, signer)
        
        const tx = await contract.settlePrediction(BigInt(entryId))
        
        if (!tx) {
          throw new Error('Failed to send settle transaction.')
        }

        setStatus('⏳ Waiting for confirmation…')
        await tx.wait(1)
        
        setStatus('✅ Prediction settled!')
      } catch (error: any) {
        console.error('[Scroll] Settle prediction failed:', error)
        const errorMessage = error?.message ?? error?.reason ?? 'Settle failed.'
        setStatus('❌ ' + errorMessage)
        throw error
      } finally {
        setIsSubmitting(false)
      }
    },
    [address, isConnected, predictionGameAddress],
  )

  const setAIScoreOnChain = useCallback(
    async (entryId: number, aiScoreScaled: number) => {
      if (!predictionGameAddress) {
        throw new Error('Prediction contract address missing.')
      }
      if (!isConnected || !address) {
        throw new Error('Wallet not connected.')
      }
      if (!Number.isFinite(aiScoreScaled) || aiScoreScaled < 0 || aiScoreScaled > 1000) {
        throw new Error('AI score must be between 0 and 1000 (scaled).')
      }

      setStatus('⏳ Publishing AI score on-chain…')
      setIsSubmitting(true)

      try {
        await ensureScrollChain()

        const ethereum = getEthereumProvider()
        const provider = new ethers.BrowserProvider(ethereum)
        const signer = await provider.getSigner()

        const contract = new ethers.Contract(predictionGameAddress, PREDICTION_GAME_SCROLL_ABI, signer)

        const tx = await contract.setAIScore(BigInt(entryId), aiScoreScaled)
        if (!tx) {
          throw new Error('Failed to send setAIScore transaction.')
        }

        setStatus('⏳ Waiting for AI score confirmation…')
        await tx.wait(1)

        setStatus('✅ AI score recorded on-chain!')
      } catch (error: any) {
        console.error('[PredictionGameScroll] setAIScore failed:', error)
        const errorMessage = error?.message ?? error?.reason ?? 'setAIScore failed.'
        setStatus('❌ ' + errorMessage)
        throw error
      } finally {
        setIsSubmitting(false)
      }
    },
    [address, isConnected, predictionGameAddress],
  )

  return {
    submitPrediction,
    revealPrediction,
    estimatePredictionCost,
    settlePrediction,
    setAIScoreOnChain,
    computeCommitment,
    status,
    isSubmitting,
  }
}

