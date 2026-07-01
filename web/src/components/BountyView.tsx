"use client";

import { useCallback } from "react";
import { useAccount } from "wagmi";
import { useBounty } from "@/hooks/useBounty";
import { isAddressEqual } from "@/lib/format";
import { decodeAiReview } from "@/lib/aiReview";
import { isTeeHiddenMode } from "@/config/contract";
import { BountyDetail } from "@/components/BountyDetail";
import { SubmitAnswer } from "@/components/SubmitAnswer";
import { RevealAnswer } from "@/components/RevealAnswer";
import { SubmitEncryptedAnswer } from "@/components/SubmitEncryptedAnswer";
import { GrantJudgingAccess } from "@/components/GrantJudgingAccess";
import { JudgeAll } from "@/components/JudgeAll";
import { JudgeAllHidden } from "@/components/JudgeAllHidden";
import { FinalizeWinner } from "@/components/FinalizeWinner";
import { AIReviewDisplay } from "@/components/AIReviewDisplay";
import { SubmissionsList } from "@/components/SubmissionsList";
import { HiddenSubmissionsList } from "@/components/HiddenSubmissionsList";
import { Card, CardBody, Notice, Spinner } from "@/components/ui";

export function BountyView({ bountyId }: { bountyId: bigint }) {
  const { address } = useAccount();
  const { bounty, isLoading, isError, refetch } = useBounty(bountyId);

  const reload = useCallback(() => {
    void refetch();
  }, [refetch]);

  if (isLoading) {
    return (
      <Card>
        <CardBody>
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <Spinner /> Loading bounty #{bountyId.toString()}…
          </div>
        </CardBody>
      </Card>
    );
  }

  if (isError || !bounty) {
    return (
      <Notice tone="red">
        Couldn&apos;t load bounty #{bountyId.toString()}. Check the id and that the
        contract address / RPC are configured correctly.
      </Notice>
    );
  }

  if (/^0x0+$/.test(bounty.owner)) {
    return (
      <Notice tone="amber">
        Bounty #{bountyId.toString()} doesn&apos;t exist.
      </Notice>
    );
  }

  const isOwner = isAddressEqual(address, bounty.owner);
  const judge = decodeAiReview(bounty.aiReview)?.parsed ?? null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <BountyDetail bountyId={bountyId} bounty={bounty} isOwner={isOwner} />
        {isTeeHiddenMode ? (
          <>
            <SubmitEncryptedAnswer
              bountyId={bountyId}
              bounty={bounty}
              onSubmitted={reload}
            />
            <GrantJudgingAccess bountyId={bountyId} bounty={bounty} />
            <JudgeAllHidden
              bountyId={bountyId}
              bounty={bounty}
              isOwner={isOwner}
              onJudged={reload}
            />
          </>
        ) : (
          <>
            <SubmitAnswer
              bountyId={bountyId}
              bounty={bounty}
              onSubmitted={reload}
            />
            <RevealAnswer
              bountyId={bountyId}
              bounty={bounty}
              onRevealed={reload}
            />
            <JudgeAll
              bountyId={bountyId}
              bounty={bounty}
              isOwner={isOwner}
              onJudged={reload}
            />
          </>
        )}
        <FinalizeWinner
          bountyId={bountyId}
          bounty={bounty}
          isOwner={isOwner}
          onFinalized={reload}
        />
      </div>

      <div className="space-y-4">
        {bounty.judged && <AIReviewDisplay aiReview={bounty.aiReview} />}
        {isTeeHiddenMode ? (
          <HiddenSubmissionsList
            bountyId={bountyId}
            count={Number(bounty.submissionCount)}
            judge={judge}
            finalWinner={
              bounty.finalized ? Number(bounty.winnerIndex) : undefined
            }
          />
        ) : (
          <SubmissionsList
            bountyId={bountyId}
            count={Number(bounty.submissionCount)}
            judge={judge}
            finalWinner={
              bounty.finalized ? Number(bounty.winnerIndex) : undefined
            }
          />
        )}
      </div>
    </div>
  );
}