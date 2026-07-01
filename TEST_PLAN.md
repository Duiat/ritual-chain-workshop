# Test Plan: Commit-Reveal Cases

## Automated coverage

Run: `cd hardhat && npx hardhat test`

### Solidity (`contracts/AIJudge.t.sol`)

| ID | Case | Expected |
|----|------|----------|
| S1 | `computeCommitment` deterministic | Same inputs → same hash |
| S2 | Commit before deadline | Stored hash; answer empty; `revealed=false` |
| S3 | Commit after deadline | Revert: `submission phase closed` |
| S4 | Valid reveal after deadline | Answer stored; `revealed=true` |
| S5 | Reveal before deadline | Revert: `submission phase open` |
| S6 | Reveal wrong salt | Revert: `invalid reveal` |
| S7 | Reveal wrong answer | Revert: `invalid reveal` |
| S8 | Reveal from wrong address | Revert: `no commitment to reveal` |
| S9 | Double reveal | Revert: `no commitment to reveal` |
| S10 | Update commitment before reveal | Same index updated; count stays 1 |
| S11 | `getSubmission` privacy | Unrevealed answers return `""` |
| S12 | `judgeAll` with zero reveals | Revert: `no revealed submissions` |
| S13 | `judgeAll` before deadline | Revert: `submission phase open` |
| S14 | `getBounty.revealedCount` | Increments only on successful reveal |

### TypeScript (`test/AIJudge.ts`)

| ID | Case | Expected |
|----|------|----------|
| T1 | Two-user commit → reveal flow | 2 submissions, 2 revealed, answers match |
| T2 | Wrong salt on reveal | Revert: `invalid reveal` |
| T3 | Commit after deadline | Revert: `submission phase closed` |
| T4 | Off-chain vs on-chain hash | `computeCommitment` matches |

## Manual test plan (Ritual Chain + UI)

### Setup

- [ ] Deploy `AIJudge` to Ritual (`npx hardhat run scripts/deploy.ts --network ritual`)
- [ ] Set `NEXT_PUBLIC_CONTRACT_ADDRESS` in `web/.env.local`
- [ ] Three wallets: Owner, User1, User2 with test RITUAL

### M1 — Happy path

| Step | Actor | Action | Verify |
|------|-------|--------|--------|
| 1 | Owner | Create bounty (deadline +5 min, reward) | Bounty appears in UI |
| 2 | User1 | Submit commitment | Submissions show hash, answer hidden |
| 3 | User2 | Submit commitment (different browser) | Two hidden entries |
| 4 | Wait | Pass deadline | Status → Reveal phase |
| 5 | User1 | Reveal answer | Entry marked Revealed; text visible |
| 6 | User2 | Reveal answer | Both revealed; count 2/2 |
| 7 | Owner | Fund RitualWallet + Judge | `judged=true`; AI review shown |
| 8 | Owner | Finalize winner | Winner paid; status Finalized |

### M2 — Privacy during commit

| Step | Actor | Action | Verify |
|------|-------|--------|--------|
| 1 | User1 | Commit answer A | User2 cannot see answer text on-chain or in UI |
| 2 | User2 | Read `getSubmission` via explorer | `answer` field empty |

### M3 — Invalid reveal

| Step | Actor | Action | Verify |
|------|-------|--------|--------|
| 1 | User1 | Reveal with wrong answer text | Tx reverts `invalid reveal` |
| 2 | User1 | Reveal with correct answer | Succeeds |

### M4 — Unrevealed exclusion

| Step | Actor | Action | Verify |
|------|-------|--------|--------|
| 1 | User1 | Commit + reveal | 1 revealed |
| 2 | User2 | Commit only (no reveal) | 1 revealed / 2 commitments |
| 3 | Owner | Judge | LLM input contains only User1's answer |
| 4 | Owner | Try finalize index 1 (unrevealed) | Revert: `winner not revealed` |

### M5 — Salt recovery

| Step | Actor | Action | Verify |
|------|-------|--------|--------|
| 1 | User1 | Commit on Browser A | Salt in localStorage |
| 2 | User1 | Open Browser B, try reveal | UI warns: no saved salt |

## Advanced track (TEE hidden) — manual

### A1 — Encrypted submit

| Step | Actor | Verify |
|------|-------|--------|
| 1 | User1 | Submit encrypted answer | `getSubmission` shows ciphertext, no plaintext |
| 2 | User1 | Grant judging access | `checkAccess(user, owner, hash)` = true |

### A2 — TEE batch judge

| Step | Actor | Verify |
|------|-------|--------|
| 1 | Owner | TEE judge after deadline | `judged=true`, `aiReview` populated |
| 2 | Anyone | Read submissions on explorer | Still ciphertext only |

### A3 — Privacy

| Check | Expected |
|-------|----------|
| Plaintext on-chain before judge | Never |
| Plaintext on-chain after judge | Never (only AI review) |
| LLM calls | One batch `judgeAll`, not per submission |

## Pass criteria

- All automated tests green (`26/26` — both contracts).
- Manual M1 completes on Ritual testnet (required track).
- Manual A1–A2 completes on Ritual testnet (advanced track).
- No plaintext answer visible before reveal in M2 (required).
- No plaintext on-chain in A3 (advanced).