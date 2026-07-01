import type { Address } from "viem";
import aiJudgeAbi from "@/abi/AIJudge";
import aiJudgeHiddenAbi from "@/abi/AIJudgeHidden";

export type ContractMode = "commit-reveal" | "tee-hidden";

const rawMode = process.env.NEXT_PUBLIC_CONTRACT_MODE?.trim();
export const contractMode: ContractMode =
  rawMode === "tee-hidden" ? "tee-hidden" : "commit-reveal";

function parseAddress(raw?: string): Address | undefined {
  const value = raw?.trim();
  return value && /^0x[0-9a-fA-F]{40}$/.test(value)
    ? (value as Address)
    : undefined;
}

const commitAddress = parseAddress(process.env.NEXT_PUBLIC_CONTRACT_ADDRESS);
const hiddenAddress = parseAddress(
  process.env.NEXT_PUBLIC_HIDDEN_CONTRACT_ADDRESS,
);

/** Active contract for the configured mode. */
export const contractAddress: Address | undefined =
  contractMode === "tee-hidden"
    ? (hiddenAddress ?? commitAddress)
    : (commitAddress ?? hiddenAddress);

export const activeAbi =
  contractMode === "tee-hidden" ? aiJudgeHiddenAbi : aiJudgeAbi;

export const aiJudgeAbiConst = activeAbi;

export const isContractConfigured = Boolean(contractAddress);

export const executorAddress: Address =
  (process.env.NEXT_PUBLIC_RITUAL_EXECUTOR_ADDRESS?.trim() as
    | Address
    | undefined) ?? "0xB42e435c4252A5a2E7440e37B609F00c61a0c91B";

export const ritualChainId = Number(
  process.env.NEXT_PUBLIC_RITUAL_CHAIN_ID ?? "1979",
);

export const ritualRpcUrl =
  process.env.NEXT_PUBLIC_RITUAL_RPC_URL ??
  "https://rpc.ritualfoundation.org";

export const isTeeHiddenMode = contractMode === "tee-hidden";