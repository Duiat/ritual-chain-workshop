# Privacy-Preserving AI Bounty Judge

Ritual Chain workshop assignment. **Primary submission: Advanced Track (TEE hidden submissions).** The required commit-reveal track is also implemented for comparison.

## Primary submission: Advanced Track (TEE Hidden)

| Item | Value |
|------|-------|
| Contract | `AIJudgeHidden.sol` |
| Deployed address (Ritual Chain) | `0x0f131da151580aa2e0fb8788e044c1b786a928a4` |
| Chain ID | `1979` |
| UI mode | `NEXT_PUBLIC_CONTRACT_MODE=tee-hidden` |
| Live demo bounty | **#1** — title *"what is ritual"*, rubric *"correctness 50%"*, 0.05 RITUAL reward |
| Status | Judged + finalized — **winner: User1 (index 0)** |
| Judge tx | `0x18eb7e6b93f2fe3164ae8267aaaf46a17bd1c06c2196f026e90eab83d80b03f6` |
| Finalize tx | `0x180f62b1f2c0459f2d56489c180da589b0a8aa0456320202babae9e9f2254316` |

Advanced track validated end-to-end on Ritual testnet (create → encrypted submit → grant access → TEE batch judge → finalize). See [TEST_PLAN.md](./TEST_PLAN.md) sections A1–A3.

Full design (where plaintext lives, on-chain vs off-chain, batch LLM): [ARCHITECTURE.md](./ARCHITECTURE.md)

### Advanced lifecycle (TEE hidden)

```
Create bounty
  → User encrypts answer client-side (ECIES → executor pubkey, keys SUB_0, SUB_1, …)
  → submitEncryptedAnswer(ciphertext, signature) — only bytes on-chain
  → User grants SecretsAccessControl to bounty owner
  → Deadline passes
  → Owner judgeAll(llmInput) — one Ritual LLM precompile call
        → TEE decrypts all ciphertexts inside the enclave
        → Substitutes SUB_0, SUB_1, … into batch prompt
        → Single inference ranks all answers
  → finalizeWinner → pay reward
```

| Phase | Who | On-chain action | What is visible |
|-------|-----|-----------------|-----------------|
| 1. Create | Owner | `createBounty(title, rubric, deadline)` + reward | Title, rubric, deadline, reward |
| 2. Submit | Participants | `submitEncryptedAnswer(bountyId, ciphertext, signature)` | Ciphertext + submitter — **not** plaintext |
| 3. Delegate | Participants | `grantAccess(owner, secretsHash)` on `SecretsAccessControl` | Delegation record (hash only) |
| 4. Judge | Owner | `judgeAll(bountyId, llmInput)` | AI review; answers stay ciphertext on-chain |
| 5. Finalize | Owner | `finalizeWinner(bountyId, winnerIndex)` | Winner + payout |

No reveal step — plaintext answers **never** appear on-chain.

### Advanced contract functions

- `submitEncryptedAnswer(uint256 bountyId, bytes encryptedAnswer, bytes secretSignature)`
- `judgeAll(uint256 bountyId, bytes calldata llmInput)`
- `finalizeWinner(uint256 bountyId, uint256 winnerIndex)`

---

## Also included: Required Track (Commit-Reveal)

`AIJudge.sol` implements the standard commit-reveal flow on EVM-compatible chains (submission logic is generic; `judgeAll` uses Ritual LLM precompile when deployed on Ritual).

```
Create bounty → Commit (hash only) → Deadline passes → Reveal (answer + salt)
      → Judge all revealed answers (Ritual LLM) → Finalize winner → Pay reward
```

| Phase | Who | On-chain action | What is visible |
|-------|-----|-----------------|-----------------|
| 1. Create | Owner | `createBounty(title, rubric, deadline)` + reward | Title, rubric, deadline, reward |
| 2. Commit | Participants | `submitCommitment(bountyId, commitment)` | Commitment hash only — **not** the answer |
| 3. Reveal | Participants | `revealAnswer(bountyId, answer, salt)` | Answer after successful reveal |
| 4. Judge | Owner | `judgeAll(bountyId, llmInput)` | AI review of **revealed** submissions only |
| 5. Finalize | Owner | `finalizeWinner(bountyId, winnerIndex)` | Winner + payout |

### Commitment formula

```solidity
commitment = keccak256(abi.encode(answer, salt, msg.sender, bountyId))
```

The contract exposes `computeCommitment()` so the frontend and scripts can derive the same hash off-chain. Only valid, revealed answers are eligible for AI judging.

### Required contract functions

- `submitCommitment(uint256 bountyId, bytes32 commitment)`
- `revealAnswer(uint256 bountyId, string calldata answer, bytes32 salt)`
- `judgeAll(uint256 bountyId, bytes calldata llmInput)`
- `finalizeWinner(uint256 bountyId, uint256 winnerIndex)`

| Track | Contract | Deployed (Ritual) |
|-------|----------|-------------------|
| Required | `AIJudge.sol` | `0xcddc0219656cc3d32d0fdd028c5ea0e50c6ea0f8` |
| Advanced | `AIJudgeHidden.sol` | `0x0f131da151580aa2e0fb8788e044c1b786a928a4` |

---

## Quick start

### 1. Deploy a contract

```bash
cd hardhat
pnpm install
npx hardhat build
npx hardhat keystore set DEPLOYER_PRIVATE_KEY
```

**Advanced track (primary):**
```bash
npx hardhat run scripts/deploy-hidden.ts --network ritual
```

**Required track (commit-reveal):**
```bash
npx hardhat run scripts/deploy.ts --network ritual
```

Copy into `web/.env.local`:

```env
# Advanced track (primary)
NEXT_PUBLIC_CONTRACT_MODE=tee-hidden
NEXT_PUBLIC_HIDDEN_CONTRACT_ADDRESS=0x0f131da151580aa2e0fb8788e044c1b786a928a4

# Required track
# NEXT_PUBLIC_CONTRACT_MODE=commit-reveal
# NEXT_PUBLIC_CONTRACT_ADDRESS=0xcddc0219656cc3d32d0fdd028c5ea0e50c6ea0f8
```

### 2. Run the web UI

```bash
cd web
pnpm install
cp .env.example .env.local   # then set contract addresses
pnpm dev
```

Open http://localhost:3000 — load bounty ID **1** to see the finalized advanced-track demo.

### 3. Demo flows

#### Advanced track (TEE hidden) — primary

| Step | Actor | Action |
|------|-------|--------|
| 1 | Owner | Create bounty |
| 2 | User 1 & 2 | **Submit encrypted answer** (ECIES in browser) |
| 3 | User 1 & 2 | **Grant judging access** to owner (`SecretsAccessControl`) |
| 4 | Owner | Fund RitualWallet (~0.35 RITUAL) + **TEE batch judge** |
| 5 | Owner | **Finalize winner** |

Full CLI flow: `npx hardhat run scripts/run-tee-bounty-flow.ts --network ritual`

#### Required track (commit-reveal)

| Step | Actor | Action |
|------|-------|--------|
| 1 | Owner | Create bounty + fund RitualWallet later |
| 2 | User 1 & 2 | Submit **commitment** before deadline |
| 3 | User 1 & 2 | **Reveal** after deadline (same browser — salt in localStorage) |
| 4 | Owner | **Judge revealed** → **Finalize winner** |

CLI demo: `npx hardhat run scripts/demo-flow.ts --network ritual`

## Tests

```bash
cd hardhat
npx hardhat test              # 26 tests (both contracts)
npx hardhat test solidity     # reveal-case unit tests (required track)
npx hardhat test nodejs       # integration flow
```

- **Required track:** automated reveal matrix in [TEST_PLAN.md](./TEST_PLAN.md) (S1–S14, M1–M5).
- **Advanced track:** manual Ritual testnet validation documented in TEST_PLAN.md (A1–A3); automated ciphertext storage tests in `test/AIJudgeHidden.ts`.

## Project layout

| Path | Purpose |
|------|---------|
| `hardhat/contracts/AIJudgeHidden.sol` | **Advanced:** TEE encrypted submissions |
| `hardhat/contracts/AIJudge.sol` | Required: commit-reveal bounty |
| `hardhat/contracts/AIJudge.t.sol` | Solidity unit tests (reveal cases) |
| `hardhat/test/AIJudgeHidden.ts` | Advanced: ciphertext storage tests |
| `hardhat/test/AIJudge.ts` | Required: integration flow |
| `hardhat/scripts/run-tee-bounty-flow.ts` | Full advanced E2E on Ritual |
| `hardhat/scripts/resume-tee-judge.ts` | Resume judge + finalize |
| `web/` | Next.js UI (dual-track: `tee-hidden` / `commit-reveal`) |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Architecture note (both tracks) |
| [TEST_PLAN.md](./TEST_PLAN.md) | Reveal + advanced test plan |

## Reflection

> **What should be public, what should stay hidden, and what should be decided by AI versus by a human in a bounty system?**

Bounty metadata (title, rubric, deadline, reward, and who participated) should be public so everyone trusts the rules and timing. In the **advanced track**, plaintext answers must stay hidden for the entire lifecycle: only ECIES ciphertext and signatures are stored on-chain, and decryption happens exclusively inside the Ritual TEE during a single batch `judgeAll` call — answers never become public on-chain, even after judging. In the **required commit-reveal track**, answers stay hidden during the submission window (commitment hashes only), then become public after reveal for auditability; unrevealed commitments are excluded from judging. AI should handle scalable, rubric-based comparison of all eligible submissions in one batch inference, producing a recommended winner index and review text. Humans should retain final authority: the bounty owner confirms the winner, handles edge cases the rubric cannot capture, and triggers payout — AI output is advisory, and only the owner can call `finalizeWinner`. This split keeps submissions fair (hidden until judge time in the advanced track), judging efficient (one LLM call for all answers), and outcomes accountable (human final decision enforced on-chain).

## Advanced track summary

| Question | Answer |
|----------|--------|
| What is public? | Bounty metadata, ciphertext blobs, submitter addresses, AI review after judging |
| What stays hidden? | Plaintext answers (never on-chain; only in TEE during `judgeAll`) |
| How does LLM batch judge? | One `judgeAll` call with `encryptedSecrets[]` + prompt placeholders `SUB_0`, `SUB_1`, … |

Full design: [ARCHITECTURE.md](./ARCHITECTURE.md)