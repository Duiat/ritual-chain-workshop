"use client";

import { useEffect, useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { contractAddress } from "@/config/contract";
import { ritualChain } from "@/config/wagmi";
import { canCommit, type Bounty } from "@/lib/bounty";
import {
  emptySecretsPolicy,
  SECRETS_ACCESS_CONTROL,
  secretsAccessControlAbi,
} from "@/lib/ritualSecrets";
import { activeAbi } from "@/config/contract";
import { useWriteTx } from "@/hooks/useWriteTx";
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  TxStatus,
  Notice,
  Spinner,
} from "@/components/ui";

const explorerBase = ritualChain.blockExplorers?.default.url;
const BLOCKS_PER_DAY = 246_858n;

export function GrantJudgingAccess({
  bountyId,
  bounty,
}: {
  bountyId: bigint;
  bounty: Bounty;
}) {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: ritualChain.id });
  const { data: walletClient } = useWalletClient();
  const [loading, setLoading] = useState(false);
  const [pendingHashes, setPendingHashes] = useState<`0x${string}`[]>([]);
  const tx = useWriteTx();

  useEffect(() => {
    if (!publicClient || !contractAddress || !address) return;

    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const count = Number(bounty.submissionCount);
        const missing: `0x${string}`[] = [];

        for (let i = 0; i < count; i++) {
          const row = await publicClient!.readContract({
            address: contractAddress!,
            abi: activeAbi,
            functionName: "getSubmission",
            args: [bountyId, BigInt(i)],
          });

          const submitter = row[0] as string;
          if (submitter.toLowerCase() !== address!.toLowerCase()) continue;

          const secretsHash = row[3] as `0x${string}`;
          const [hasAccess] = await publicClient!.readContract({
            address: SECRETS_ACCESS_CONTROL,
            abi: secretsAccessControlAbi,
            functionName: "checkAccess",
            args: [address!, bounty.owner, secretsHash],
          });

          if (!hasAccess) missing.push(secretsHash);
        }

        if (!cancelled) setPendingHashes(missing);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [publicClient, contractAddress, address, bountyId, bounty]);

  if (!isConnected || !canCommit(bounty) || pendingHashes.length === 0) {
    return null;
  }

  async function handleGrant() {
    if (!walletClient || !publicClient || pendingHashes.length === 0) return;

    const currentBlock = await publicClient.getBlockNumber();
    const expiresAt = currentBlock + BLOCKS_PER_DAY;

    for (const secretsHash of pendingHashes) {
      await tx.run({
        address: SECRETS_ACCESS_CONTROL,
        abi: secretsAccessControlAbi,
        functionName: "grantAccess",
        args: [bounty.owner, secretsHash, expiresAt, emptySecretsPolicy],
        chainId: ritualChain.id,
      });
    }

    setPendingHashes([]);
  }

  return (
    <Card>
      <CardHeader
        title="Grant judging access"
        subtitle="Let the bounty owner use your encrypted answer in the TEE batch judge call."
      />
      <CardBody className="space-y-3">
        <Notice tone="amber">
          Ritual requires delegating secret access to the bounty owner before
          they can call judgeAll with your ciphertext.
        </Notice>
        <Button
          onClick={handleGrant}
          disabled={loading || tx.isBusy}
          className="w-full"
        >
          {loading ? (
            <>
              <Spinner /> Checking access…
            </>
          ) : tx.isBusy ? (
            "Granting…"
          ) : (
            `Grant access (${pendingHashes.length})`
          )}
        </Button>
        <TxStatus
          state={tx.state}
          error={tx.error}
          hash={tx.hash}
          explorerBase={explorerBase}
        />
      </CardBody>
    </Card>
  );
}