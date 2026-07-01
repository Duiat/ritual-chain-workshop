"use client";

import { useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { useNow } from "@/hooks/useNow";
import { contractAddress, activeAbi } from "@/config/contract";
import { ritualChain } from "@/config/wagmi";
import { canCommit, type Bounty } from "@/lib/bounty";
import {
  encryptSubmissionAnswer,
  fetchLlmExecutor,
  signEncryptedSecret,
} from "@/lib/ritualSecrets";
import { useWriteTx } from "@/hooks/useWriteTx";
import {
  Card,
  CardHeader,
  CardBody,
  Field,
  Textarea,
  Button,
  TxStatus,
  Notice,
} from "@/components/ui";

const explorerBase = ritualChain.blockExplorers?.default.url;

export function SubmitEncryptedAnswer({
  bountyId,
  bounty,
  onSubmitted,
}: {
  bountyId: bigint;
  bounty: Bounty;
  onSubmitted: () => void;
}) {
  const { isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: ritualChain.id });
  const { data: walletClient } = useWalletClient();
  const [answer, setAnswer] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [prepError, setPrepError] = useState<string | null>(null);
  const now = useNow();
  const tx = useWriteTx(() => {
    setAnswer("");
    onSubmitted();
  });

  if (!canCommit(bounty, now / 1000)) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!answer.trim() || !contractAddress || !publicClient || !walletClient) {
      return;
    }

    setPrepError(null);
    setPreparing(true);
    try {
      const executor = await fetchLlmExecutor();
      const submissionIndex = Number(bounty.submissionCount);

      const encryptedAnswer = await encryptSubmissionAnswer(
        answer.trim(),
        submissionIndex,
        executor.publicKey,
      );
      const secretSignature = await signEncryptedSecret(
        walletClient,
        encryptedAnswer,
      );

      setPreparing(false);

      await tx.run({
        address: contractAddress,
        abi: activeAbi,
        functionName: "submitEncryptedAnswer",
        args: [bountyId, encryptedAnswer, secretSignature],
        chainId: ritualChain.id,
      });
    } catch (err) {
      setPreparing(false);
      setPrepError(
        (err as { shortMessage?: string; message?: string }).shortMessage ||
          (err as Error).message ||
          "Failed to encrypt submission.",
      );
    }
  }

  return (
    <Card>
      <CardHeader
        title="Submit encrypted answer"
        subtitle="Only ciphertext is stored on-chain. Plaintext exists in the Ritual TEE during judging."
      />
      <CardBody>
        <Notice tone="indigo">
          Your answer is ECIES-encrypted to the LLM executor public key. After
          submitting, grant judging access so the bounty owner can batch-judge
          without seeing your plaintext.
        </Notice>
        <form onSubmit={handleSubmit} className="mt-3 space-y-3">
          <Field label="Your answer">
            <Textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={5}
              placeholder="Write your submission…"
            />
          </Field>
          <Button
            type="submit"
            disabled={
              !isConnected || !answer.trim() || preparing || tx.isBusy
            }
            className="w-full"
          >
            {preparing
              ? "Encrypting…"
              : tx.isBusy
                ? "Submitting…"
                : "Submit encrypted answer"}
          </Button>
          {prepError && <Notice tone="red">{prepError}</Notice>}
          {!isConnected && (
            <p className="text-xs text-zinc-500">
              Connect your wallet to submit.
            </p>
          )}
          <TxStatus
            state={tx.state}
            error={tx.error}
            hash={tx.hash}
            explorerBase={explorerBase}
          />
        </form>
      </CardBody>
    </Card>
  );
}