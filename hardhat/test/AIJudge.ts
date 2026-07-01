import { describe, it } from "node:test";
import assert from "node:assert/strict";
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

describe("AIJudge commit-reveal flow", async () => {
  const { viem, networkHelpers } = await network.create();
  const publicClient = await viem.getPublicClient();
  const [owner, alice, bob] = await viem.getWalletClients();

  const aliceAnswer = "Alice: hide answers with commit-reveal.";
  const bobAnswer = "Bob: batch judge with Ritual LLM.";
  const aliceSalt = keccak256("0x616c696365");
  const bobSalt = keccak256("0x626f62");

  async function deployFixture() {
    const judge = await viem.deployContract("AIJudge");
    const now = await networkHelpers.time.latest();
    const deadline = BigInt(now) + 3600n;

    await judge.write.createBounty(
      ["Privacy bounty", "Best technical answer wins", deadline],
      { account: owner.account, value: 1_000_000_000_000_000_000n },
    );

    return { judge, deadline };
  }

  it("runs create -> commit -> reveal for two users", async () => {
    const { judge, deadline } = await networkHelpers.loadFixture(deployFixture);
    const bountyId = 1n;

    const aliceCommitment = computeCommitment(
      aliceAnswer,
      aliceSalt,
      alice.account.address,
      bountyId,
    );
    const bobCommitment = computeCommitment(
      bobAnswer,
      bobSalt,
      bob.account.address,
      bountyId,
    );

    await judge.write.submitCommitment([bountyId, aliceCommitment], {
      account: alice.account,
    });
    await judge.write.submitCommitment([bountyId, bobCommitment], {
      account: bob.account,
    });

    const [, , hiddenAlice, aliceRevealed] = await judge.read.getSubmission([
      bountyId,
      0n,
    ]);
    assert.equal(hiddenAlice, "");
    assert.equal(aliceRevealed, false);

    await networkHelpers.time.increaseTo(deadline);

    await judge.write.revealAnswer([bountyId, aliceAnswer, aliceSalt], {
      account: alice.account,
    });
    await judge.write.revealAnswer([bountyId, bobAnswer, bobSalt], {
      account: bob.account,
    });

    const bounty = await judge.read.getBounty([bountyId]);
    assert.equal(bounty[7], 2n);
    assert.equal(bounty[8], 2n);

    const [, , revealedBob, bobRevealed] = await judge.read.getSubmission([
      bountyId,
      1n,
    ]);
    assert.equal(revealedBob, bobAnswer);
    assert.equal(bobRevealed, true);
  });

  it("rejects reveal with wrong salt", async () => {
    const { judge, deadline } = await networkHelpers.loadFixture(deployFixture);
    const bountyId = 1n;

    const commitment = computeCommitment(
      aliceAnswer,
      aliceSalt,
      alice.account.address,
      bountyId,
    );

    await judge.write.submitCommitment([bountyId, commitment], {
      account: alice.account,
    });

    await networkHelpers.time.increaseTo(deadline);

    await viem.assertions.revertWith(
      judge.write.revealAnswer([bountyId, aliceAnswer, bobSalt], {
        account: alice.account,
      }),
      "invalid reveal",
    );
  });

  it("rejects commitment after deadline", async () => {
    const { judge, deadline } = await networkHelpers.loadFixture(deployFixture);
    const bountyId = 1n;

    await networkHelpers.time.increaseTo(deadline);

    const commitment = computeCommitment(
      aliceAnswer,
      aliceSalt,
      alice.account.address,
      bountyId,
    );

    await viem.assertions.revertWith(
      judge.write.submitCommitment([bountyId, commitment], {
        account: alice.account,
      }),
      "submission phase closed",
    );
  });

  it("matches on-chain computeCommitment helper", async () => {
    const { judge } = await networkHelpers.loadFixture(deployFixture);
    const bountyId = 1n;

    const offChain = computeCommitment(
      aliceAnswer,
      aliceSalt,
      alice.account.address,
      bountyId,
    );
    const onChain = await judge.read.computeCommitment([
      aliceAnswer,
      aliceSalt,
      alice.account.address,
      bountyId,
    ]);

    assert.equal(offChain, onChain);
  });
});