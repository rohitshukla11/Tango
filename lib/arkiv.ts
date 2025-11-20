import { createWalletClient, createPublicClient, http } from '@arkiv-network/sdk'
import { stringToPayload } from '@arkiv-network/sdk/utils'
import { eq } from '@arkiv-network/sdk/query'
import { mendoza } from '@arkiv-network/sdk/chains'
import { privateKeyToAccount } from 'viem/accounts'

type ArkivChainKey = 'mendoza'

export interface ArkivJudgeSnapshot {
  name: string
  persona: string
  score: number
  comment: string
}

export interface ArkivScoreEventInput {
  entryId: string
  videoCid: string
  aiScore: number
  aiScoreScaled: number
  judges: ArkivJudgeSnapshot[]
  reasoning: string
  creator?: string
  status?: string
  expiresInSeconds?: number
  metadata?: Record<string, unknown>
}

export interface ArkivBetEventInput {
  entryId: string
  videoCid: string
  predictor: string
  predictedScore: number
  stakeWei: string
  transactionHash?: string
  unlockBlock?: string
  expiresInSeconds?: number
  metadata?: Record<string, unknown>
}

export interface ArkivWindowEventInput {
  entryId: string
  videoCid: string
  creator: string
  windowSeconds: number
  kind?: 'prediction' | 'voting' | 'staking'
  metadata?: Record<string, unknown>
}

export interface ArkivEntitySummary<TPayload = unknown> {
  entityKey: string
  attributes: Record<string, string>
  payload?: TPayload
  rawPayload?: string
  expirationTimestamp?: number
  createdAt?: number
}

const DEFAULT_RPC = 'https://mendoza.hoodi.arkiv.network/rpc'

const DEFAULT_SCORE_TTL = Math.max(Number(process.env.ARKIV_SCORE_TTL_SECONDS) || 3600, 60)
const DEFAULT_BET_TTL = Math.max(Number(process.env.ARKIV_BET_TTL_SECONDS) || 1800, 60)
const DEFAULT_WINDOW_TTL = Math.max(Number(process.env.ARKIV_WINDOW_TTL_SECONDS) || 10800, 300)

let walletClientInstance: ReturnType<typeof createWalletClient> | null = null
let publicClientInstance: ReturnType<typeof createPublicClient> | null = null

function ensureServerContext() {
  if (typeof window !== 'undefined') {
    throw new Error('Arkiv SDK is only available on the server')
  }
}

function resolveChain(key?: string) {
  const normalized = (key ?? 'mendoza').toLowerCase() as ArkivChainKey
  switch (normalized) {
    case 'mendoza':
    default:
      return mendoza
  }
}

export async function getArkivWalletClient() {
  ensureServerContext()

  if (walletClientInstance) {
    return walletClientInstance
  }

  const privateKey = process.env.ARKIV_PRIVATE_KEY
  if (!privateKey) {
    console.warn('[Arkiv] ARKIV_PRIVATE_KEY missing. Wallet client disabled.')
    return null
  }

  try {
    walletClientInstance = createWalletClient({
      chain: resolveChain(process.env.ARKIV_NETWORK),
      transport: http(process.env.ARKIV_RPC_URL || DEFAULT_RPC),
      account: privateKeyToAccount(privateKey as `0x${string}`),
    })
    return walletClientInstance
  } catch (error) {
    console.error('[Arkiv] Failed to create wallet client:', error)
    return null
  }
}

export async function getArkivPublicClient() {
  ensureServerContext()

  if (publicClientInstance) {
    return publicClientInstance
  }

  try {
    publicClientInstance = createPublicClient({
      chain: resolveChain(process.env.ARKIV_NETWORK),
      transport: http(process.env.ARKIV_RPC_URL || DEFAULT_RPC),
    })
    return publicClientInstance
  } catch (error) {
    console.error('[Arkiv] Failed to create public client:', error)
    return null
  }
}

function toAttributesRecord(attributes: { key: string; value: string }[] = []) {
  return attributes.reduce<Record<string, string>>((acc, attr) => {
    if (attr.key) {
      acc[attr.key] = attr.value
    }
    return acc
  }, {})
}

function safeJsonParse<T = unknown>(input?: string | null): T | undefined {
  if (!input) return undefined
  try {
    return JSON.parse(input) as T
  } catch (error) {
    console.warn('[Arkiv] Failed to parse payload JSON:', error)
    return undefined
  }
}

async function publishEntity(params: {
  payload: Record<string, unknown>
  attributes: { key: string; value: string }[]
  expiresIn: number
  contentType?: string
}) {
  const wallet = await getArkivWalletClient()
  if (!wallet) {
    return null
  }

  const expiresIn = Math.max(params.expiresIn, 60)
  const payloadWithTimestamps = {
    ...params.payload,
    createdAt: Date.now(),
    expiresAt: Date.now() + expiresIn * 1000,
  }

  try {
    const result = await wallet.createEntity({
      payload: stringToPayload(JSON.stringify(payloadWithTimestamps)),
      contentType: (params.contentType ?? 'application/json') as any,
      attributes: params.attributes,
      expiresIn,
    })

    return {
      entityKey: result.entityKey,
      expiresAt: payloadWithTimestamps.expiresAt,
    }
  } catch (error) {
    console.error('[Arkiv] Failed to publish entity:', error)
    return null
  }
}

export async function publishScoreEvent(input: ArkivScoreEventInput) {
  const expiresIn = input.expiresInSeconds ?? DEFAULT_SCORE_TTL

  return publishEntity({
    expiresIn,
    payload: {
      type: 'score',
      ...input,
    },
    attributes: [
      { key: 'type', value: 'score' },
      { key: 'entryId', value: input.entryId },
      { key: 'videoCid', value: input.videoCid },
      { key: 'score', value: input.aiScore.toFixed(2) },
      { key: 'scoreScaled', value: String(input.aiScoreScaled) },
      { key: 'creator', value: input.creator ?? 'unknown' },
      { key: 'status', value: input.status ?? 'judged' },
    ],
  })
}

export async function publishBetEvent(input: ArkivBetEventInput) {
  const expiresIn = input.expiresInSeconds ?? DEFAULT_BET_TTL

  return publishEntity({
    expiresIn,
    payload: {
      type: 'bet',
      ...input,
    },
    attributes: [
      { key: 'type', value: 'bet' },
      { key: 'entryId', value: input.entryId },
      { key: 'predictor', value: input.predictor },
      { key: 'stakeWei', value: input.stakeWei },
      { key: 'predictedScore', value: input.predictedScore.toFixed(2) },
      { key: 'videoCid', value: input.videoCid },
      { key: 'unlockBlock', value: input.unlockBlock ?? '' },
      { key: 'txHash', value: input.transactionHash ?? '' },
    ],
  })
}

export async function publishWindowEvent(input: ArkivWindowEventInput) {
  const expiresIn = Math.max(input.windowSeconds ?? DEFAULT_WINDOW_TTL, 60)
  return publishEntity({
    expiresIn,
    payload: {
      type: 'window',
      ...input,
    },
    attributes: [
      { key: 'type', value: 'window' },
      { key: 'entryId', value: input.entryId },
      { key: 'videoCid', value: input.videoCid },
      { key: 'creator', value: input.creator },
      { key: 'windowSeconds', value: String(input.windowSeconds) },
      { key: 'kind', value: input.kind ?? 'prediction' },
    ],
  })
}

export async function queryEntitiesByType<T = unknown>(type: string, limit = 200): Promise<ArkivEntitySummary<T>[]> {
  const publicClient = await getArkivPublicClient()
  if (!publicClient) {
    return []
  }

  try {
    const result = await publicClient.buildQuery().where([eq('type', type)]).fetch()

    const entities = (result?.entities ?? []).slice(0, limit)
    return entities.map((entity: any) => {
      const payloadText = entity?.toText?.()
      const parsed = safeJsonParse<T & { createdAt?: number; expiresAt?: number }>(payloadText)
      return {
        entityKey: entity.entityKey,
        attributes: toAttributesRecord(entity.attributes),
        payload: parsed,
        rawPayload: payloadText,
        expirationTimestamp: parsed?.expiresAt,
        createdAt: parsed?.createdAt,
      }
    })
  } catch (error) {
    console.error('[Arkiv] Query failed for type', type, error)
    return []
  }
}

export function toArkivSummary<T = unknown>(entity: any): ArkivEntitySummary<T> {
  const payloadText = entity?.toText?.()
  const parsed = safeJsonParse<T & { createdAt?: number; expiresAt?: number }>(payloadText)
  return {
    entityKey: entity.entityKey,
    attributes: toAttributesRecord(entity.attributes),
    payload: parsed,
    rawPayload: payloadText,
    expirationTimestamp: parsed?.expiresAt,
    createdAt: parsed?.createdAt,
  }
}

export function decodeArkivPayload<T = unknown>(payloadText?: string | null) {
  return safeJsonParse<T>(payloadText)
}

