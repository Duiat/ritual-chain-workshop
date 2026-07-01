# AIJudge — Hardhat package

Commit-reveal bounty contract for the Privacy-Preserving AI Bounty Judge assignment.

## Commands

```bash
pnpm install
npx hardhat build
npx hardhat test
```

## Deploy

```bash
# Set deployer key (Ritual Chain)
npx hardhat keystore set DEPLOYER_PRIVATE_KEY

# Deploy
npx hardhat run scripts/deploy.ts --network ritual
```

## Demo script (local)

```bash
npx hardhat run scripts/demo-flow.ts --network hardhatMainnet
```

## Ignition (alternative deploy)

```bash
npx hardhat ignition deploy ignition/modules/AIJudge.ts --network ritual
```

See the [root README](../README.md) for the full lifecycle and UI setup.