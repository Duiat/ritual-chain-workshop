import {
  createPublicClient,
  encodeAbiParameters,
  http,
  keccak256,
  parseAbiParameters,
  toBytes,
  toHex,
  type Address,
  type Hex,
  type WalletClient,
} from "viem";
import { ritualChain } from "@/config/wagmi";

/** Ritual requires 12-byte AES-GCM nonces for ECIES secrets. */
const ECIES_NONCE_LENGTH = 12;

export const TEE_SERVICE_REGISTRY =
  "0x9644e8562cE0Fe12b4deeC4163c064A8862Bf47F" as const;
export const SECRETS_ACCESS_CONTROL =
  "0xf9BF1BC8A3e79B9EBeD0fa2Db70D0513fecE32FD" as const;

/** LLM capability id on TEEServiceRegistry. */
const CAPABILITY_LLM = 1;

const teeRegistryAbi = [
  {
    name: "getServicesByCapability",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "capability", type: "uint8" },
      { name: "checkValidity", type: "bool" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          {
            name: "node",
            type: "tuple",
            components: [
              { name: "paymentAddress", type: "address" },
              { name: "teeAddress", type: "address" },
              { name: "teeType", type: "uint8" },
              { name: "publicKey", type: "bytes" },
              { name: "endpoint", type: "string" },
              { name: "certPubKeyHash", type: "bytes32" },
              { name: "capability", type: "uint8" },
            ],
          },
          { name: "isValid", type: "bool" },
          { name: "workloadId", type: "bytes32" },
        ],
      },
    ],
  },
] as const;

export type RitualExecutor = {
  teeAddress: Address;
  publicKey: Hex;
};

export function submissionSecretKey(index: number): string {
  return `SUB_${index}`;
}

/** Discover a live LLM-capable TEE executor from chain registry. */
export async function fetchLlmExecutor(
  rpcUrl?: string,
): Promise<RitualExecutor> {
  const client = createPublicClient({
    chain: ritualChain,
    transport: http(rpcUrl),
  });

  const services = await client.readContract({
    address: TEE_SERVICE_REGISTRY,
    abi: teeRegistryAbi,
    functionName: "getServicesByCapability",
    args: [CAPABILITY_LLM, true],
  });

  if (services.length === 0) {
    throw new Error("No active LLM executors found on Ritual Chain.");
  }

  const node = services[0].node;
  return {
    teeAddress: node.teeAddress,
    publicKey: node.publicKey,
  };
}

/**
 * Encrypt a bounty answer for Ritual TEE substitution.
 * Each submission uses a unique template key: SUB_0, SUB_1, ...
 */
export async function encryptSubmissionAnswer(
  answer: string,
  submissionIndex: number,
  executorPublicKey: Hex,
): Promise<Hex> {
  const { encrypt, ECIES_CONFIG } = await import("eciesjs");
  const { Buffer } = await import("buffer");
  ECIES_CONFIG.symmetricNonceLength = ECIES_NONCE_LENGTH;

  const key = submissionSecretKey(submissionIndex);
  const secretsJson = JSON.stringify({ [key]: answer });
  const pubKeyHex = executorPublicKey.startsWith("0x")
    ? executorPublicKey.slice(2)
    : executorPublicKey;

  const encryptedBuffer = encrypt(pubKeyHex, Buffer.from(secretsJson, "utf8"));
  return toHex(Uint8Array.from(encryptedBuffer)) as Hex;
}

export function secretsHash(encryptedAnswer: Hex): Hex {
  return keccak256(encryptedAnswer);
}

export async function signEncryptedSecret(
  walletClient: WalletClient,
  encryptedAnswer: Hex,
): Promise<Hex> {
  const account = walletClient.account;
  if (!account) throw new Error("Wallet account required");

  return walletClient.signMessage({
    account,
    message: { raw: toBytes(encryptedAnswer) },
  });
}

export const secretsAccessControlAbi = [
  {
    name: "grantAccess",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "delegate", type: "address" },
      { name: "secretsHash", type: "bytes32" },
      { name: "expiresAt", type: "uint256" },
      {
        name: "policy",
        type: "tuple",
        components: [
          { name: "allowedDestinations", type: "string[]" },
          { name: "allowedMethods", type: "string[]" },
          { name: "allowedPaths", type: "string[]" },
          { name: "allowedQueryParams", type: "string[]" },
          { name: "allowedHeaders", type: "string[]" },
          { name: "secretLocation", type: "string" },
          { name: "bodyFormat", type: "string" },
        ],
      },
    ],
    outputs: [],
  },
  {
    name: "checkAccess",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "delegate", type: "address" },
      { name: "secretsHash", type: "bytes32" },
    ],
    outputs: [
      { name: "hasAccess", type: "bool" },
      {
        name: "policy",
        type: "tuple",
        components: [
          { name: "allowedDestinations", type: "string[]" },
          { name: "allowedMethods", type: "string[]" },
          { name: "allowedPaths", type: "string[]" },
          { name: "allowedQueryParams", type: "string[]" },
          { name: "allowedHeaders", type: "string[]" },
          { name: "secretLocation", type: "string" },
          { name: "bodyFormat", type: "string" },
        ],
      },
    ],
  },
] as const;

export const emptySecretsPolicy = {
  allowedDestinations: [] as string[],
  allowedMethods: [] as string[],
  allowedPaths: [] as string[],
  allowedQueryParams: [] as string[],
  allowedHeaders: [] as string[],
  secretLocation: "",
  bodyFormat: "",
} as const;

/** Encode placeholder metadata for debugging — not sent on-chain as plaintext answers. */
export function encodeSubmissionPlaceholder(
  index: number,
  submitter: Address,
): string {
  return encodeAbiParameters(parseAbiParameters("uint256, address"), [
    BigInt(index),
    submitter,
  ]);
}