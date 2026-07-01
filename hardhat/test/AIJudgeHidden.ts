import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { keccak256 } from "viem";

describe("AIJudgeHidden encrypted submissions", async () => {
  const { viem, networkHelpers } = await network.create();

  async function deployFixture() {
    const judge = await viem.deployContract("AIJudgeHidden");
    const now = await networkHelpers.time.latest();
    const deadline = BigInt(now) + 3600n;

    await judge.write.createBounty(
      ["TEE bounty", "Rubric", deadline],
      { account: (await viem.getWalletClients())[0].account, value: 1_000_000_000_000_000_000n },
    );

    return { judge, deadline };
  }

  it("stores ciphertext without ever exposing plaintext on-chain", async () => {
    const { judge } = await networkHelpers.loadFixture(deployFixture);
    const [, alice] = await viem.getWalletClients();
    const bountyId = 1n;

    const ciphertext = "0xc0ffee01" as const;
    const signature = "0xdeadbeef" as const;

    await judge.write.submitEncryptedAnswer([bountyId, ciphertext, signature], {
      account: alice.account,
    });

    const [submitter, storedCipher, , secretsHash, secretKey] =
      await judge.read.getSubmission([bountyId, 0n]);

    assert.equal(submitter.toLowerCase(), alice.account.address.toLowerCase());
    assert.equal(storedCipher, ciphertext);
    assert.equal(secretsHash, keccak256(ciphertext));
    assert.equal(secretKey, "SUB_0");
  });

  it("rejects submissions after deadline", async () => {
    const { judge, deadline } = await networkHelpers.loadFixture(deployFixture);
    const [, alice] = await viem.getWalletClients();
    const bountyId = 1n;

    await networkHelpers.time.increaseTo(deadline);

    await viem.assertions.revertWith(
      judge.write.submitEncryptedAnswer([bountyId, "0x01", "0x02"], {
        account: alice.account,
      }),
      "submission phase closed",
    );
  });
});