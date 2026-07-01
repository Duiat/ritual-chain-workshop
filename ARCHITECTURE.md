# Architecture

This project implements **both** assignment tracks:

| Track | Contract | Submission | When plaintext appears |
|-------|----------|------------|------------------------|
| **Required** | `AIJudge.sol` | Commitment hash → reveal | After user calls `revealAnswer` |
| **Advanced** | `AIJudgeHidden.sol` | ECIES ciphertext | Only inside Ritual TEE during `judgeAll` |

---

## Required track: commit-reveal (`AIJudge.sol`)

### Problem

Plaintext `submitAnswer` let competitors copy ideas before the deadline.

### Solution

1. **Commit phase** (`now < deadline`): store `keccak256(abi.encode(answer, salt, submitter, bountyId))` only.
2. **Reveal phase** (`now >= deadline`): user proves knowledge of `(answer, salt)`; contract stores plaintext.
3. **Judge**: owner batches **revealed** answers into one Ritual LLM call.
4. **Finalize**: owner pays winner.

### On-chain vs off-chain

| Data | Location | Visibility |
|------|----------|------------|
| Title, rubric, deadline, reward | On-chain | Public |
| Commitment hash | On-chain | Public |
| Answer + salt | Off-chain (user) until reveal | Hidden |
| Plaintext answer | On-chain after reveal | Public |
| AI review | On-chain after judge | Public |

---

## Advanced track: Ritual-native hidden submissions (`AIJudgeHidden.sol`)

### Problem

Commit-reveal still exposes plaintext **before** judging (during reveal phase). Competitors who monitor reveals could still copy late entries.

### Solution

Answers never appear as plaintext on-chain. They are ECIES-encrypted to the LLM executor public key and decrypted **only inside the Ritual TEE** when the owner runs batch judging.

### Lifecycle

```
Create bounty
  → User encrypts answer client-side (ECIES → executor pubkey, key SUB_0, SUB_1, …)
  → submitEncryptedAnswer(ciphertext, signature) — only bytes on-chain
  → User grants SecretsAccessControl to bounty owner (delegation)
  → Deadline passes
  → Owner judgeAll(llmInput) — one LLM precompile call
        → TEE decrypts all ciphertexts
        → Substitutes SUB_0, SUB_1, … into batch prompt
        → Single LLM inference ranks all answers
  → finalizeWinner
```

### Where plaintext exists

| Phase | Plaintext location |
|-------|-------------------|
| User typing answer | Browser memory only (never sent raw to chain) |
| After submit | **Nowhere public** — only ciphertext on-chain |
| During `judgeAll` | **Ritual TEE enclave** (LLM precompile `0x0802`) |
| After judging | AI review public; **answers stay ciphertext on-chain** |

### On-chain vs off-chain

| Data | Stored | Who can read |
|------|--------|--------------|
| Bounty metadata | On-chain | Everyone |
| `encryptedAnswer` (ECIES blob) | On-chain | Opaque to humans; TEE decrypts |
| `secretSignature` | On-chain | Proves submitter encrypted the blob |
| `secretsHash` | On-chain | Used for `SecretsAccessControl` delegation |
| Executor public key | Off-chain registry (`TEEServiceRegistry`) | Public |
| User's answer text | Never on-chain | TEE-only at judge time |
| `llmInput` calldata | In `judgeAll` tx | Contains ciphertexts, not plaintext |
| `aiReview` | On-chain after judge | Public |

### How the LLM receives submissions (batch, not per-answer)

The owner UI builds **one** `llmInput` payload:

1. Read all `getSubmission` rows → collect `encryptedAnswer` + `secretSignature`.
2. Build prompt with placeholders `SUB_0`, `SUB_1`, … (not plaintext).
3. Encode LLM precompile request with:
   - `encryptedSecrets[]` = all on-chain ciphertexts
   - `secretSignatures[]` = matching submitter signatures
   - `messagesJson` = rubric + placeholder submission list
4. `judgeAll(bountyId, llmInput)` forwards to precompile `0x0802`.
5. TEE decrypts secrets, substitutes placeholders, runs **one** inference, returns ranking JSON.

See `web/src/lib/ritualLlmHidden.ts` and `web/src/lib/ritualSecrets.ts`.

### Ritual components used

| Component | Role |
|-----------|------|
| `TEEServiceRegistry` | Discover LLM executor + public key |
| ECIES (`eciesjs`, 12-byte nonce) | Client-side encryption |
| `SecretsAccessControl` | User delegates secret use to bounty owner |
| `LLM_INFERENCE_PRECOMPILE` (`0x0802`) | TEE batch judging |
| `RitualWallet` | Prepay async inference fees |

### Security properties

- **No plaintext on-chain** before or after judging (only ciphertext + AI review).
- **No reveal step** — users cannot accidentally expose answers early.
- **Batch judging** — one LLM call for all submissions (assignment requirement).
- **Delegation** — owner can judge without learning plaintext off-chain.

### Limitations

- Users must call **Grant judging access** (`SecretsAccessControl.grantAccess`) after submit.
- Ciphertext is visible on-chain (content hidden, participation visible).
- Requires Ritual Chain (precompile + TEE); not generic EVM.

---

## Shared: AI judging & finalization

Both contracts use the same pattern for:

- `judgeAll(bountyId, llmInput)` → Ritual LLM precompile
- `finalizeWinner(bountyId, winnerIndex)` → owner pays winner
- AI output is **advisory**; human owner confirms winner

---

## Deploying each track

```bash
# Required track
npx hardhat run scripts/deploy.ts --network ritual
# NEXT_PUBLIC_CONTRACT_MODE=commit-reveal
# NEXT_PUBLIC_CONTRACT_ADDRESS=0x...

# Advanced track
npx hardhat run scripts/deploy-hidden.ts --network ritual
# NEXT_PUBLIC_CONTRACT_MODE=tee-hidden
# NEXT_PUBLIC_HIDDEN_CONTRACT_ADDRESS=0x...
```