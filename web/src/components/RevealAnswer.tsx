"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { useNow } from "@/hooks/useNow";
import aiJudgeAbi from "@/abi/AIJudge";
import { contractAddress } from "@/config/contract";
import { ritualChain } from "@/config/wagmi";
import { canReveal, type Bounty } from "@/lib/bounty";
import { clearSalt, loadSalt } from "@/lib/commitment";
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

export function RevealAnswer({
  bountyId,
  bounty,
  onRevealed,
}: {
  bountyId: bigint;
  bounty: Bounty;
  onRevealed: () => void;
}) {
  const { isConnected } = useAccount();
  const [answer, setAnswer] = useState("");
  const now = useNow();
  const tx = useWriteTx(() => {
    clearSalt(bountyId);
    setAnswer("");
    onRevealed();
  });

  if (!canReveal(bounty, now / 1000)) return null;

  const savedSalt = loadSalt(bountyId);

  async function handleReveal(e: React.FormEvent) {
    e.preventDefault();
    if (!answer.trim() || !contractAddress) return;

    const salt = savedSalt ?? loadSalt(bountyId);
    if (!salt) return;

    try {
      await tx.run({
        address: contractAddress,
        abi: aiJudgeAbi,
        functionName: "revealAnswer",
        args: [bountyId, answer.trim(), salt],
        chainId: ritualChain.id,
      });
    } catch {
      /* surfaced via tx.state */
    }
  }

  return (
    <Card>
      <CardHeader
        title="Reveal your answer"
        subtitle="After the deadline, reveal the answer and salt that match your commitment."
      />
      <CardBody>
        {!savedSalt ? (
          <Notice tone="amber">
            No saved salt found for this bounty on this browser. Use the same
            device you used to submit your commitment, or re-submit before the
            deadline with a new salt.
          </Notice>
        ) : (
          <form onSubmit={handleReveal} className="space-y-3">
            <Field label="Your answer" hint="Must match the text you committed to.">
              <Textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                rows={5}
                placeholder="Paste the exact answer you committed…"
              />
            </Field>
            <Button
              type="submit"
              disabled={!isConnected || !answer.trim() || tx.isBusy}
              className="w-full"
            >
              {tx.isBusy ? "Revealing…" : "Reveal answer"}
            </Button>
            {!isConnected && (
              <p className="text-xs text-zinc-500">
                Connect your wallet to reveal.
              </p>
            )}
            <TxStatus
              state={tx.state}
              error={tx.error}
              hash={tx.hash}
              explorerBase={explorerBase}
            />
          </form>
        )}
      </CardBody>
    </Card>
  );
}