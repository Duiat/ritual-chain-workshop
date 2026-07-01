# Privacy-Preserving AI Bounty Judge

Ritual Chain workshop assignment with **both tracks**:

- **Required:** `AIJudge.sol` — commit-reveal (hash → reveal → judge)
- **Advanced:** `AIJudgeHidden.sol` — Ritual TEE encrypted submissions (no reveal; plaintext only in TEE during judging)

## Lifecycle

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

The contract exposes `computeCommitment()` so the frontend and scripts can derive the same hash off-chain.

## Quick start

### 1. Deploy a contract

```bash
cd hardhat
pnpm install
npx hardhat build
npx hardhat keystore set DEPLOYER_PRIVATE_KEY
```

**Required track (commit-reveal):**
```bash
npx hardhat run scripts/deploy.ts --network ritual
```

**Advanced track (TEE hidden):**
```bash
npx hardhat run scripts/deploy-hidden.ts --network ritual
```

Copy into `web/.env.local`:

```env
# Required track
NEXT_PUBLIC_CONTRACT_MODE=commit-reveal
NEXT_PUBLIC_CONTRACT_ADDRESS=0x...

# Advanced track
NEXT_PUBLIC_CONTRACT_MODE=tee-hidden
NEXT_PUBLIC_HIDDEN_CONTRACT_ADDRESS=0x...
```

### 2. Run the web UI

```bash
cd web
pnpm install
cp .env.example .env.local   # then set CONTRACT_ADDRESS
pnpm dev
```

Open http://localhost:3000

### 3. Demo flows

#### Required track (commit-reveal)

| Step | Actor | Action |
|------|-------|--------|
| 1 | Owner | Create bounty + fund RitualWallet later |
| 2 | User 1 & 2 | Submit **commitment** before deadline |
| 3 | User 1 & 2 | **Reveal** after deadline (same browser — salt in localStorage) |
| 4 | Owner | **Judge revealed** → **Finalize winner** |

#### Advanced track (TEE hidden)

| Step | Actor | Action |
|------|-------|--------|
| 1 | Owner | Create bounty |
| 2 | User 1 & 2 | **Submit encrypted answer** (ECIES in browser) |
| 3 | User 1 & 2 | **Grant judging access** to owner (`SecretsAccessControl`) |
| 4 | Owner | **TEE batch judge** (one LLM call; decryption in enclave only) |
| 5 | Owner | **Finalize winner** |

No reveal step — answers never appear as plaintext on-chain.

### 4. CLI demo (optional)

```bash
cd hardhat
npx hardhat run scripts/demo-flow.ts --network hardhatMainnet
```

Runs create → two commitments → two reveals automatically on a local chain.

## Tests

```bash
cd hardhat
npx hardhat test              # 14 Solidity + 4 TypeScript tests
npx hardhat test solidity     # reveal-case unit tests only
npx hardhat test nodejs       # integration flow
```

See [TEST_PLAN.md](./TEST_PLAN.md) for the full reveal test matrix.

## Project layout

| Path | Purpose |
|------|---------|
| `hardhat/contracts/AIJudge.sol` | Required: commit-reveal bounty |
| `hardhat/contracts/AIJudgeHidden.sol` | Advanced: TEE encrypted submissions |
| `hardhat/contracts/AIJudge.t.sol` | Solidity unit tests |
| `hardhat/test/AIJudge.ts` | TypeScript integration tests |
| `hardhat/scripts/deploy.ts` | Deploy to any configured network |
| `hardhat/scripts/demo-flow.ts` | Scripted two-user demo |
| `web/` | Next.js UI for create / commit / reveal / judge / finalize |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Design notes |
| [TEST_PLAN.md](./TEST_PLAN.md) | Reveal test plan |

## Required contract functions

- `submitCommitment(uint256 bountyId, bytes32 commitment)`
- `revealAnswer(uint256 bountyId, string calldata answer, bytes32 salt)`
- `judgeAll(uint256 bountyId, bytes calldata llmInput)`
- `finalizeWinner(uint256 bountyId, uint256 winnerIndex)`

## Reflection

> **What should be public, what should stay hidden, and what should be decided by AI versus by a human in a bounty system?**

Bounty metadata (title, rubric, deadline, reward, and who submitted a commitment) should be public so participants can trust the rules and timing. Plaintext answers must stay hidden during the submission window so others cannot copy or improve on revealed ideas; only commitment hashes should appear on-chain until the reveal phase. After the deadline, revealed answers become public for auditability, but unrevealed commitments are excluded from judging. AI should handle scalable, rubric-based comparison of all revealed submissions in a single batch, producing a ranking and recommended winner. Humans should retain final authority: the owner confirms the winner, resolves edge cases the rubric cannot capture, and triggers payout. AI output is advisory; the contract enforces that only the owner can finalize and pay. This split keeps the process fair (hidden submissions), efficient (batch AI judging), and accountable (human final decision on-chain).

## Advanced track summary

| Question | Answer |
|----------|--------|
| What is public? | Bounty metadata, ciphertext blobs, submitter addresses, AI review after judging |
| What stays hidden? | Plaintext answers (never on-chain; only in TEE during `judgeAll`) |
| How does LLM batch judge? | One `judgeAll` call with `encryptedSecrets[]` + prompt placeholders `SUB_0`, `SUB_1`, … |

Full design: [ARCHITECTURE.md](./ARCHITECTURE.md)