"use client";

import { useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { contractAddress, activeAbi } from "@/config/contract";
import { ritualChain } from "@/config/wagmi";
import { canJudgeHidden, type Bounty } from "@/lib/bounty";
import { buildHiddenJudgeAllLlmInput } from "@/lib/ritualLlmHidden";
import { fetchLlmExecutor } from "@/lib/ritualSecrets";
import { useWriteTx } from "@/hooks/useWriteTx";
import { useRitualWalletStatus } from "@/hooks/useRitualWalletStatus";
import { RitualWalletPanel } from "@/components/RitualWalletPanel";
import { Card, CardHeader, CardBody, Button, TxStatus, Notice, Spinner } from "@/components/ui";
import type { Address, Hex } from "viem";

const explorerBase = ritualChain.blockExplorers?.default.url;

export function JudgeAllHidden({
  bountyId,
  bounty,
  isOwner,
  onJudged,
}: {
  bountyId: bigint;
  bounty: Bounty;
  isOwner: boolean;
  onJudged: () => void;
}) {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: ritualChain.id });
  const [gathering, setGathering] = useState(false);
  const [gatherError, setGatherError] = useState<string | null>(null);
  const tx = useWriteTx(() => onJudged());
  const walletStatus = useRitualWalletStatus(address);

  const count = Number(bounty.submissionCount);

  if (!isOwner || !canJudgeHidden(bounty) || count === 0) return null;

  async function handleJudge() {
    if (!publicClient || !contractAddress || !walletStatus.ready) return;
    setGatherError(null);
    setGathering(true);

    try {
      const executor = await fetchLlmExecutor();
      const submissions = [];

      for (let i = 0; i < count; i++) {
        const row = await publicClient.readContract({
          address: contractAddress,
          abi: activeAbi,
          functionName: "getSubmission",
          args: [bountyId, BigInt(i)],
        });

        submissions.push({
          index: i,
          submitter: row[0] as Address,
          encryptedAnswer: row[1] as Hex,
          secretSignature: row[2] as Hex,
          secretKey: row[4] as string,
        });
      }

      const llmInput = buildHiddenJudgeAllLlmInput({
        executor,
        title: bounty.title,
        rubric: bounty.rubric,
        submissions,
      });

      setGathering(false);

      await tx.run({
        address: contractAddress,
        abi: activeAbi,
        functionName: "judgeAll",
        args: [bountyId, llmInput],
        chainId: ritualChain.id,
      });
    } catch (e) {
      setGathering(false);
      setGatherError(
        (e as { shortMessage?: string; message?: string }).shortMessage ||
          (e as Error).message ||
          "Failed to build TEE judge request.",
      );
    }
  }

  const busy = gathering || tx.isBusy;
  const fundingReady = walletStatus.ready === true;

  return (
    <Card>
      <CardHeader
        title="TEE batch judge"
        subtitle="One Ritual LLM call decrypts all ciphertexts inside the enclave."
      />
      <CardBody className="space-y-3">
        <Notice tone="indigo">
          Plaintext answers are never read by this UI. Ciphertext + signatures
          are forwarded to the LLM precompile; decryption happens only in the
          TEE.
        </Notice>

        <RitualWalletPanel status={walletStatus} onDeposited={walletStatus.refetch} />

        <Button onClick={handleJudge} disabled={busy || !fundingReady} className="w-full">
          {gathering ? (
            <>
              <Spinner /> Bundling {count} encrypted submissions…
            </>
          ) : tx.isBusy ? (
            "Judging in TEE…"
          ) : !fundingReady ? (
            "Fund RitualWallet to judge"
          ) : (
            `TEE judge all (${count})`
          )}
        </Button>
        {gatherError && <Notice tone="red">{gatherError}</Notice>}
        <TxStatus state={tx.state} error={tx.error} hash={tx.hash} explorerBase={explorerBase} />
      </CardBody>
    </Card>
  );
}