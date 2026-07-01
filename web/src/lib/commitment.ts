import {
  encodeAbiParameters,
  keccak256,
  parseAbiParameters,
  type Address,
} from "viem";

const COMMITMENT_PARAMS = parseAbiParameters(
  "string, bytes32, address, uint256",
);

/** Matches `AIJudge.computeCommitment` on-chain. */
export function computeCommitment(
  answer: string,
  salt: `0x${string}`,
  submitter: Address,
  bountyId: bigint,
): `0x${string}` {
  return keccak256(
    encodeAbiParameters(COMMITMENT_PARAMS, [
      answer,
      salt,
      submitter,
      bountyId,
    ]),
  );
}

/** Random 32-byte salt for commit-reveal. */
export function generateSalt(): `0x${string}` {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

const SALT_STORAGE_PREFIX = "bounty-salt:";

export function saveSalt(bountyId: bigint, salt: `0x${string}`) {
  localStorage.setItem(`${SALT_STORAGE_PREFIX}${bountyId}`, salt);
}

export function loadSalt(bountyId: bigint): `0x${string}` | null {
  const value = localStorage.getItem(`${SALT_STORAGE_PREFIX}${bountyId}`);
  return value?.startsWith("0x") ? (value as `0x${string}`) : null;
}

export function clearSalt(bountyId: bigint) {
  localStorage.removeItem(`${SALT_STORAGE_PREFIX}${bountyId}`);
}