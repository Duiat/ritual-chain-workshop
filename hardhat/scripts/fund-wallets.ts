import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { network } from "hardhat";
import { parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";

function loadRecipients(): `0x${string}`[] {
  const env: Record<string, string> = {};
  for (const line of readFileSync(resolve(process.cwd(), ".env"), "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  const normalize = (raw: string) =>
    (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;
  return [
    privateKeyToAccount(normalize(env.User1)).address,
    privateKeyToAccount(normalize(env.User2)).address,
  ];
}

const AMOUNT = parseEther("0.005");

async function main() {
  const { viem } = await network.connect();
  const [deployer] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();

  console.log("Funding from:", deployer.account.address);
  console.log("Amount per wallet:", "0.005 RITUAL");

  for (const to of loadRecipients()) {
    const before = await publicClient.getBalance({ address: to });
    const hash = await deployer.sendTransaction({
      to,
      value: AMOUNT,
    });
    await publicClient.waitForTransactionReceipt({ hash });
    const after = await publicClient.getBalance({ address: to });
    console.log(`\n${to}`);
    console.log("  tx:", hash);
    console.log("  before:", before.toString(), "wei");
    console.log("  after:", after.toString(), "wei");
  }

  console.log("\nDone.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});