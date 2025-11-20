Latent.fun — AI Talent Competition + Cross-Chain Prize Payouts
================================================================

This repository contains a full-stack dApp for AI-driven talent competitions built on a **dual-network architecture**:

It integrates:
- **Synapse SDK** (Filecoin Onchain Cloud) for decentralized video/metadata storage on Filecoin
- **Arkiv SDK** (Mendoza DB-chain) for verifiable indexing, TTL automation, and live data streaming
- **Scroll (L2)** for on-chain staking, predictions, and payouts
- **VRF** for tie-breaking and randomness
- **Conditional Signatures** for secure prize release

## 🚀 Quick Start

**New to this project?** Start here:
1. **Setup & Deploy**: [`BASE_BLOCKLOCK_SETUP.md`](./BASE_BLOCKLOCK_SETUP.md) - Complete guide
2. **Vercel Deployment**: [`VERCEL_DEPLOYMENT.md`](./VERCEL_DEPLOYMENT.md) - Vercel-specific deployment guide
3. **Current Status**: [`STATUS.md`](./STATUS.md) - What's working now

### Network Overview

We intentionally separate concerns across complementary networks:
- ✅ **Filecoin Calibration** — video + metadata storage via Synapse Filecoin Onchain Cloud
- ✅ **Scroll (Sepolia/Mainnet)** — staking, encrypted predictions, and payouts
- ✅ **Arkiv Mendoza Testnet** — real-time scoring feed, TTL automation, analytics-ready data
- ✅ Automatic wallet switching handled via Wagmi/RainbowKit helpers

> ⚠️ **Note:** Earlier documentation referenced a single-chain Filecoin setup and Base/Randamu for predictions. The application now operates with Filecoin for storage, Scroll L2 for staking/predictions, and Arkiv for data indexing. Sections below will be revised—follow the code and updated docs (`BLOCKLOCK_TECHNICAL_FLOW.md`) for the latest architecture.

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                   Latent.fun dApp                             │
│           (Next.js + React + Wagmi + RainbowKit)              │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│            Filecoin Calibration Testnet                       │
│                  (Chain ID: 314159)                           │
├──────────────────────────────────────────────────────────────┤
│  📦 Storage Layer (Synapse SDK)                               │
│  • Video Storage                                              │
│  • Metadata Storage                                           │
│  • USDFC Payments                                             │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                   Scroll (Sepolia/Mainnet)                    │
│              (Chain ID: 534351 / 534352)                      │
├──────────────────────────────────────────────────────────────┤
│  🔐 Staking & Prediction Layer                                │
│  • Encrypted predictions (PredictionGame)                     │
│  • Stake handling + payouts                                   │
│  • Scroll-native unlock scheduling                            │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                 Arkiv DB-Chain (Mendoza)                      │
├──────────────────────────────────────────────────────────────┤
│  • Real-time scoring feed (subscriptions)                     │
│  • TTL automation for bets & voting windows                   │
│  • Open analytics + public leaderboards                       │
└──────────────────────────────────────────────────────────────┘
```

Directories
-----------
- `contracts/*.sol` — Solidity smart contracts (LatentContest, PredictionGame, PrizePayout)
- `lib/filecoin.ts` — Synapse SDK wrappers (upload/retrieve/pay)
- `lib/blocklock.ts` — Legacy encryption utilities retained while Scroll-native staking migrates off Randamu
- `lib/randamu.ts` — Legacy Only Swaps client helpers (kept for historical reference)
- `src/app/**/*` — Next.js app (pages and API routes)
- `scripts/*.ts` — CLI scripts (deploy, prediction flows, maintenance)
- `scripts/deploy-prediction-game.ts` — Deploy PredictionGame to Base
- `BASE_BLOCKLOCK_SETUP.md` — (Legacy) Base BlockLock setup guide; kept for historical reference

Acceptance Criteria (Authoritative)
-----------------------------------
✅ Uses Synapse SDK (upload + retrieval + stablecoin payment rails) on **Filecoin Calibration**

✅ Deploys smart contracts to **Scroll (Sepolia/Mainnet)** for staking & predictions:
- **PredictionGame**: Encrypted predictions + staking + payouts

✅ Maintains Filecoin `LatentContest` for entry registry + AI score oracle

✅ Streams scoring + TTL data through **Arkiv DB-chain**:
- **Real-time subscriptions** for judge scores & stake updates
- **TTL automation** for predictions, stakes, and voting windows
- **Open analytics**: leaderboards, creator metrics, betting dashboards

✅ Public GitHub repo

✅ Working frontend with automatic network switching between Filecoin (storage) and Scroll (staking)

✅ Demo video showing full flow

## ✨ Key Features

- **Dual-Network**: Storage on Filecoin Calibration, encrypted predictions + staking on Base
- **Encrypted Predictions**: Scroll-staked encrypted scores using `PredictionGame`
- **Decentralized Storage**: Videos stored on Filecoin via Synapse SDK
- **AI Judging**: GPT-4o vision pipeline with frame extraction + OpenAI fallbacks
- **Real-Time Updates**: Entry display with local storage persistence
- **Cross-Chain Prizes**: Only Swaps (legacy) or same-chain fallback for payouts
- **MetaMask Friendly**: Automatic network switching and error handling for Scroll staking flows

Architecture Overview
---------------------
- Game:
  - Creator uploads video (Synapse) and registers entry on Filecoin `LatentContest`.
- Prediction flow happens on Scroll via `PredictionGame.submitPrediction` (encrypted score + stake).
  - AI judges produce a score (0–10) and `setAIScore` (owner-only) pushes it to `PredictionGame`.
  - FinalScore = average(AIScore, AudienceAvgScore) using 2-decimal scaling (still tracked in Filecoin `LatentContest`).
- Staking / Prize Logic:
  - Platform fee = 10% (Filecoin `LatentContest`).
  - Remaining 90% reward pool and settlement handled inside `PredictionGame` payouts (2x stake for perfect prediction, tiered otherwise).
- Cross-chain Infra:
  - Scroll staking + Arkiv TTLs keep predictions synced
  - Only Swaps (legacy) still available for payouts, but same-chain fallback is enabled by default
  - VRF: Tie-breaking for minimum audience error includes a 1% tie-bonus routed to a VRF-selected winner (demo uses a deterministic fallback; wire actual VRF on deployment).
  - Conditional signatures: `PrizePayout` requires an EIP‑712 signature authorizing prize release after reveal + finalization.

Contracts (Solidity / Foundry-compatible)
-----------------------------------------
- `LatentContest.sol`
  - Tracks entries, CIDs, creator/audience stakes, audience scores, AI score.
  - Computes AudienceAvg and FinalScore = average(AIScore, AudienceAvg).
  - Finalize gate, and `settle()` transfers platform fee and forwards remaining pool to `PrizePayout.executePayout`.
- `PredictionGame.sol`
  - Single-contract Scroll flow (submit ➞ decrypt ➞ settle) with encrypted payloads.
  - Stores encrypted `TypesLib.Ciphertext`, unlock block, stake, and decrypted score.
  - Owner sets AI score via `setAIScore`. Anyone can call `settlePrediction` after unlock.
- `PrizePayout.sol`
  - Calculates creator share (60/40/20) and audience pro‑rata by accuracy vs AI.
  - Optional VRF tie-bonus (1% of audience pool) if multiple addresses tie for min error.
  - Emits payout vector and calls Randamu Only Swaps (configurable address) or falls back to same-chain native transfers.
  - EIP‑712 conditional signature gate to authorize release.

Synapse SDK Integration (Filecoin Onchain Cloud)
------------------------------------------------
Provided in `lib/filecoin.ts`:
- `uploadFile(file): Promise<string>` — returns CID
- `uploadJSON(obj): Promise<string>` — returns CID
- `getFile(cid): Promise<ArrayBuffer>`
- `payForStorage(cid, bytes)` — pays via Synapse stablecoin rails

Environment variables for Synapse:
- `SYNAPSE_API_BASE` — Synapse REST base (replace with the official endpoint)
- `SYNAPSE_API_KEY` — API key
- `SYNAPSE_STABLECOIN` — stablecoin rails identifier (e.g., USDC)

Legacy Only Swaps Integration
-----------------------------
Provided in `lib/randamu.ts` (optional legacy support):
- EIP‑712 typed data builder for conditional release
- Utility to submit Only Swaps via backend (`/api/payout`)

Next.js Frontend
----------------
Routes:
- `/upload` — upload video (Synapse), prepare prediction commit (salt + scaled score)
- `/entry/[id]` — stream video and submit audience score (+ stake)
- `/result/[id]` — show AI score, audience avg, final score; sign conditional release; trigger settle
- `/solvers` — Super Solver dashboard (bonus): shows attempted routes and winner (from backend events)
- `/profile/[wallet]` — basic CID portfolio placeholder

Hooks:
- `useFilecoin()` — wrappers for Synapse storage APIs
- `useRandamu()` — Only Swaps client
- `usePredictionCommit()` — prepare commit inputs (scoreScaled + salt)
- `usePredictionReveal()` — placeholder to call reveal via wallet
- `useExecuteOnlySwap()` — call backend Only Swaps route

Backend API (Next.js route handlers)
------------------------------------
- `POST /api/filecoin/upload` — uploads video/JSON to Synapse and pays for storage
- `POST /api/judge` — pseudo AI score + metadata upload to Synapse (replace with actual model)
- `POST /api/payout` — calls Randamu Only Swaps (demo: logs solver attempts and winner)
- `GET /api/payout?events=1` — returns solver events for dashboard

Deploy to Filecoin Calibration (CLI)
------------------------------------
Requirements:
- Node.js 18+
- `npm i`
- Env variables:
  - `FILECOIN_RPC_URL` (default: https://api.calibration.node.glif.io/rpc/v1)
  - `FILECOIN_PRIVATE_KEY` (deployer)
  - `PLATFORM_TREASURY` (address for 10% fee; defaults to deployer)

Commands:
1) Deploy contracts:
```
npx ts-node ./scripts/deploy.ts
```
Outputs addresses to `src/config/contracts.json`.

2) Commit prediction (Scroll staking flow):
```
export VIDEO_CID=<cid>
export PREDICTED_SCORE=7.25
export CREATOR_STAKE_FIL=0.05
export SALT_HEX=0xabc123       # optional
npx ts-node ./scripts/commit.ts
```

3) Reveal prediction (after finalize):
```
export ENTRY_ID=1
export SCORE_SCALED=725        # 7.25 * 100
export SALT_HEX=0xabc123
npx ts-node ./scripts/reveal.ts
```

4) Finalize and settle (conditional signatures + Only Swaps):
```
export ENTRY_ID=1
npx ts-node ./scripts/settle.ts
```

Development
-----------
Frontend:
```
npm run dev
```

Environment (.env.local):
```
SYNAPSE_API_BASE=<your_synapse_base>
SYNAPSE_API_KEY=<your_api_key>
SYNAPSE_STABLECOIN=USDC
FILECOIN_RPC_URL=https://api.calibration.node.glif.io/rpc/v1
FILECOIN_PRIVATE_KEY=<hex>
PLATFORM_TREASURY=<0x...>
```

Notes & Assumptions
-------------------
- Scores use 2-decimal scaling (0..1000 ↔ 0.00..10.00).
- Audience rewards are pro‑rata by accuracy vs AI score; only stakers share the audience portion. Credits-mode users contribute to the audience average without receiving payouts.
- VRF: A pseudo-random fallback is used in `PrizePayout.sol` for tie-bonus selection. For production, plug in Randamu/Chainlink VRF on Filecoin Calibration and wire the callback.
- Only Swaps: The payout vector is emitted and executed through a configurable aggregator. A same-chain fallback via native transfers is provided if the aggregator is not set.
- Conditional signatures: EIP‑712 typed data authorizes `PrizePayout.executePayout` after finalization and reveal.

License
-------
MIT


