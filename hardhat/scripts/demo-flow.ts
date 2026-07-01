import { network } from "hardhat";
import {
  encodeAbiParameters,
  keccak256,
  parseAbiParameters,
  type Address,
} from "viem";

function computeCommitment(
  answer: string,
  salt: `0x${string}`,
  submitter: Address,
  bountyId: bigint,
): `0x${string}` {
  return keccak256(
    encodeAbiParameters(parseAbiParameters("string, bytes32, address, uint256"), [
      answer,
      salt,
      submitter,
      bountyId,
    ]),
  );
}

/**
 * End-to-end commit-reveal demo on a live network.
 * Set CONTRACT_ADDRESS env var to an already-deployed AIJudge, or deploy fresh.
 *
 *   CONTRACT_ADDRESS=0x... npx hardhat run scripts/demo-flow.ts --network ritual
 */
async function main() {
  const { viem, networkHelpers } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [owner, user1, user2] = await viem.getWalletClients();

  let judge;
  const existing = process.env.CONTRACT_ADDRESS as Address | undefined;

  if (existing) {
    judge = await viem.getContractAt("AIJudge", existing);
    console.log("Using existing AIJudge at", existing);
  } else {
    judge = await viem.deployContract("AIJudge");
    console.log("Deployed AIJudge at", judge.address);
  }

  const now = BigInt(await networkHelpers.time.latest());
  const deadline = now + 120n;

  console.log("\n1. Owner creates bounty…");
  await judge.write.createBounty(
    [
      "Privacy-Preserving Bounty Demo",
      "Best commit-reveal explanation wins.",
      deadline,
    ],
    { account: owner.account, value: 500_000_000_000_000_000n },
  );

  const bountyId = await judge.read.nextBountyId();
  const activeBountyId = bountyId - 1n;
  console.log("   Bounty id:", activeBountyId.toString());

  const user1Answer = "User1: commit a hash during submission, reveal after deadline.";
  const user2Answer = "User2: salt + answer must match keccak256(answer, salt, sender, bountyId).";
  const user1Salt = keccak256("0x7573657231");
  const user2Salt = keccak256("0x7573657232");

  console.log("\n2. User1 submits commitment…");
  await judge.write.submitCommitment(
    [activeBountyId, computeCommitment(user1Answer, user1Salt, user1.account.address, activeBountyId)],
    { account: user1.account },
  );

  console.log("3. User2 submits commitment…");
  await judge.write.submitCommitment(
    [activeBountyId, computeCommitment(user2Answer, user2Salt, user2.account.address, activeBountyId)],
    { account: user2.account },
  );

  const hidden = await judge.read.getSubmission([activeBountyId, 0n]);
  console.log("   Hidden answer (user1):", hidden[2] === "" ? "(empty — good)" : hidden[2]);

  console.log("\n4. Waiting for deadline…");
  await networkHelpers.time.increaseTo(deadline);

  console.log("5. User1 reveals…");
  await judge.write.revealAnswer([activeBountyId, user1Answer, user1Salt], {
    account: user1.account,
  });

  console.log("6. User2 reveals…");
  await judge.write.revealAnswer([activeBountyId, user2Answer, user2Salt], {
    account: user2.account,
  });

  const bounty = await judge.read.getBounty([activeBountyId]);
  console.log("   Submissions:", bounty[7].toString());
  console.log("   Revealed:", bounty[8].toString());

  console.log("\n7. Owner can now call judgeAll(bountyId, llmInput) from the web UI.");
  console.log("8. After judging, owner calls finalizeWinner(bountyId, winnerIndex).");
  console.log("\nDemo complete up to judging. Contract:", judge.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});