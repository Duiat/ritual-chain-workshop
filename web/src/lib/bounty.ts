import type { Address } from "viem";
import { isTeeHiddenMode } from "@/config/contract";

/** Parsed shape of the `getBounty` tuple return value. */
export type Bounty = {
  owner: Address;
  title: string;
  rubric: string;
  reward: bigint;
  deadline: bigint;
  judged: boolean;
  finalized: boolean;
  submissionCount: bigint;
  revealedCount?: bigint;
  winnerIndex: bigint;
  aiReview: `0x${string}`;
};

/** getBounty returns a positional tuple — map it to a named object. */
export function parseBounty(raw: readonly unknown[]): Bounty {
  if (isTeeHiddenMode) {
    const [
      owner,
      title,
      rubric,
      reward,
      deadline,
      judged,
      finalized,
      submissionCount,
      winnerIndex,
      aiReview,
    ] = raw as [
      Address,
      string,
      string,
      bigint,
      bigint,
      boolean,
      boolean,
      bigint,
      bigint,
      `0x${string}`,
    ];
    return {
      owner,
      title,
      rubric,
      reward,
      deadline,
      judged,
      finalized,
      submissionCount,
      winnerIndex,
      aiReview,
    };
  }

  const [
    owner,
    title,
    rubric,
    reward,
    deadline,
    judged,
    finalized,
    submissionCount,
    revealedCount,
    winnerIndex,
    aiReview,
  ] = raw as [
    Address,
    string,
    string,
    bigint,
    bigint,
    boolean,
    boolean,
    bigint,
    bigint,
    bigint,
    `0x${string}`,
  ];
  return {
    owner,
    title,
    rubric,
    reward,
    deadline,
    judged,
    finalized,
    submissionCount,
    revealedCount,
    winnerIndex,
    aiReview,
  };
}

export type BountyStatus = "open" | "reveal" | "ready" | "judged" | "finalized";

/** Ritual chain stores bounty deadlines in milliseconds. */
function deadlinePassed(b: Bounty, nowMs = Date.now()): boolean {
  const deadline = Number(b.deadline);
  return deadline > 1_000_000_000_000 ? deadline <= nowMs : deadline <= nowMs / 1000;
}

export function getBountyStatus(b: Bounty, nowMs = Date.now()): BountyStatus {
  if (b.finalized) return "finalized";
  if (b.judged) return "judged";
  const passed = deadlinePassed(b, nowMs);
  if (!passed) return "open";
  if (isTeeHiddenMode) return "ready";
  if ((b.revealedCount ?? 0n) > 0n) return "ready";
  return "reveal";
}

export const STATUS_META: Record<
  BountyStatus,
  { label: string; tone: "green" | "amber" | "indigo" | "zinc" }
> = {
  open: { label: "Open (commit)", tone: "green" },
  reveal: { label: "Reveal phase", tone: "amber" },
  ready: { label: "Ready for judging", tone: "amber" },
  judged: { label: "Judged", tone: "indigo" },
  finalized: { label: "Finalized", tone: "zinc" },
};

/** Can a participant still submit a commitment? */
export function canCommit(b: Bounty, nowMs = Date.now()): boolean {
  return !b.judged && !b.finalized && !deadlinePassed(b, nowMs);
}

/** Can a participant reveal after the deadline? */
export function canReveal(b: Bounty, nowMs = Date.now()): boolean {
  return !b.judged && !b.finalized && deadlinePassed(b, nowMs);
}

/** Can the owner trigger AI judging? */
export function canJudge(b: Bounty, nowMs = Date.now()): boolean {
  return (
    !b.judged &&
    !b.finalized &&
    deadlinePassed(b, nowMs) &&
    (b.revealedCount ?? 0n) > 0n
  );
}

/** TEE-hidden track: judge after deadline if any ciphertext exists. */
export function canJudgeHidden(b: Bounty, nowMs = Date.now()): boolean {
  return (
    !b.judged &&
    !b.finalized &&
    deadlinePassed(b, nowMs) &&
    b.submissionCount > 0n
  );
}