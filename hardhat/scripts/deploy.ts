import { network } from "hardhat";

/**
 * Deploy AIJudge to the configured network (use --network ritual for Ritual Chain).
 *
 *   npx hardhat run scripts/deploy.ts --network ritual
 */
async function main() {
  const { viem } = await network.connect();
  const [deployer] = await viem.getWalletClients();

  console.log("Deploying AIJudge with:", deployer.account.address);

  const judge = await viem.deployContract("AIJudge");

  console.log("AIJudge deployed at:", judge.address);
  console.log("");
  console.log("Next steps:");
  console.log("1. Copy the address into web/.env.local as NEXT_PUBLIC_CONTRACT_ADDRESS");
  console.log("2. cd web && pnpm dev");
  console.log("3. Or run the demo script:");
  console.log(`   npx hardhat run scripts/demo-flow.ts --network ritual`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});