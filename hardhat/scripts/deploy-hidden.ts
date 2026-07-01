import { network } from "hardhat";

/**
 * Deploy AIJudgeHidden (Advanced / TEE track).
 *
 *   npx hardhat run scripts/deploy-hidden.ts --network ritual
 */
async function main() {
  const { viem } = await network.connect();
  const [deployer] = await viem.getWalletClients();

  console.log("Deploying AIJudgeHidden with:", deployer.account.address);

  const judge = await viem.deployContract("AIJudgeHidden");

  console.log("AIJudgeHidden deployed at:", judge.address);
  console.log("");
  console.log("Set in web/.env.local:");
  console.log("  NEXT_PUBLIC_CONTRACT_MODE=tee-hidden");
  console.log(`  NEXT_PUBLIC_HIDDEN_CONTRACT_ADDRESS=${judge.address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});