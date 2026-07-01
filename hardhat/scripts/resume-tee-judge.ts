import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeAbiParameters,
  hexToString,
  http,
  parseAbiParameters,
  parseEther,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const CONTRACT = "0x0f131da151580aa2e0fb8788e044c1b786a928a4" as Address;
const BOUNTY_ID = BigInt(process.env.BOUNTY_ID ?? "1");
const RITUAL_WALLET = "0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948" as const;
/** LLM precompile can require ~0.31 RITUAL per batch judge call. */
const MIN_LLM_BALANCE = parseEther("0.35");
const LOCK_DURATION = 100_000n;
const TEE_REGISTRY = "0x9644e8562cE0Fe12b4deeC4163c064A8862Bf47F" as const;
const SECRETS_AC = "0xf9BF1BC8A3e79B9EBeD0fa2Db70D0513fecE32FD" as const;

const judgeAbi = [
  {
    name: "judgeAll",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "bountyId", type: "uint256" },
      { name: "llmInput", type: "bytes" },
    ],
    outputs: [],
  },
  {
    name: "finalizeWinner",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "bountyId", type: "uint256" },
      { name: "winnerIndex", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "getBounty",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "bountyId", type: "uint256" }],
    outputs: [
      { name: "owner", type: "address" },
      { name: "title", type: "string" },
      { name: "rubric", type: "string" },
      { name: "reward", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "judged", type: "bool" },
      { name: "finalized", type: "bool" },
      { name: "submissionCount", type: "uint256" },
      { name: "winnerIndex", type: "uint256" },
      { name: "aiReview", type: "bytes" },
    ],
  },
  {
    name: "getSubmission",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "bountyId", type: "uint256" },
      { name: "index", type: "uint256" },
    ],
    outputs: [
      { name: "submitter", type: "address" },
      { name: "encryptedAnswer", type: "bytes" },
      { name: "secretSignature", type: "bytes" },
      { name: "secretsHash", type: "bytes32" },
      { name: "secretKey", type: "string" },
    ],
  },
] as const;

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

const JUDGE_SYSTEM_PROMPT = `You are an impartial technical bounty judge.
Evaluate all submissions against the bounty rubric.
Choose exactly one winner. Return only valid JSON, no markdown.
Return: {"winnerIndex": number, "summary": "ok"}`;

function loadOwnerKey(): `0x${string}` {
  const env = readFileSync(resolve(process.cwd(), ".env"), "utf8");
  for (const line of env.split("\n")) {
    if (line.startsWith("DEPLOYER_PRIVATE_KEY=")) {
      const v = line.split("=")[1].trim();
      return (v.startsWith("0x") ? v : `0x${v}`) as `0x${string}`;
    }
  }
  throw new Error("DEPLOYER_PRIVATE_KEY missing");
}

function buildLlmInput(
  executor: Address,
  title: string,
  rubric: string,
  subs: {
    index: number;
    submitter: Address;
    secretKey: string;
    encryptedAnswer: Hex;
    secretSignature: Hex;
  }[],
): Hex {
  const lines = subs
    .map(
      (s) =>
        `  - index: ${s.index}\n    submitter: ${s.submitter}\n    answer: ${s.secretKey}`,
    )
    .join("\n");

  const messages = JSON.stringify([
    {
      role: "system",
      content: "Judge only against rubric. Return only valid JSON.",
    },
    {
      role: "user",
      content: `${JUDGE_SYSTEM_PROMPT}\n\nTitle: ${title}\nRubric: ${rubric}\n\nSubmissions:\n${lines}`,
    },
  ]);

  const llmParams = parseAbiParameters(
    "address, bytes[], uint256, bytes[], bytes, string, string, int256, string, bool, int256, string, string, uint256, bool, int256, string, bytes, int256, string, string, bool, int256, bytes, bytes, int256, int256, string, bool, (string,string,string)",
  );

  return encodeAbiParameters(llmParams, [
    executor,
    subs.map((s) => s.encryptedAnswer),
    500n,
    subs.map((s) => s.secretSignature),
    "0x",
    messages,
    "zai-org/GLM-4.7-FP8",
    0n,
    "",
    false,
    8192n,
    "",
    "",
    1n,
    true,
    0n,
    "medium",
    "0x",
    -1n,
    "auto",
    "",
    false,
    700n,
    "0x",
    "0x",
    -1n,
    1000n,
    "",
    false,
    ["", "", ""],
  ]);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForJudged(
  publicClient: ReturnType<typeof createPublicClient>,
  bountyId: bigint,
  txHash?: `0x${string}`,
): Promise<void> {
  const deadline = Date.now() + 1_200_000;
  while (Date.now() < deadline) {
    const bounty = await publicClient.readContract({
      address: CONTRACT,
      abi: judgeAbi,
      functionName: "getBounty",
      args: [bountyId],
    });
    if (bounty[5]) {
      console.log("Bounty judged on-chain.");
      return;
    }
    if (txHash) {
      try {
        const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
        console.log("Tx mined, status:", receipt.status, "block:", receipt.blockNumber.toString());
        if (receipt.status === "reverted") {
          throw new Error("judgeAll transaction reverted on-chain");
        }
      } catch {
        /* still pending */
      }
    }
    console.log("Waiting for TEE judge to settle…");
    await sleep(10_000);
  }
  throw new Error("Timed out waiting for judged=true");
}

function parseWinner(aiReview: Hex): number {
  try {
    const raw = hexToString(aiReview);
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const obj = JSON.parse(raw.slice(start, end + 1)) as { winnerIndex?: number };
      if (typeof obj.winnerIndex === "number") return obj.winnerIndex;
    }
  } catch {
    /* ignore */
  }
  return 0;
}

async function main() {
  const ritualChain = defineChain({
    id: 1979,
    name: "Ritual",
    nativeCurrency: { name: "RITUAL", symbol: "RITUAL", decimals: 18 },
    rpcUrls: { default: { http: ["https://rpc.ritualfoundation.org"] } },
  });

  const publicClient = createPublicClient({ chain: ritualChain, transport: http() });
  const ownerAccount = privateKeyToAccount(loadOwnerKey());
  const owner = createWalletClient({
    account: ownerAccount,
    chain: ritualChain,
    transport: http(),
  });

  const bounty = await publicClient.readContract({
    address: CONTRACT,
    abi: judgeAbi,
    functionName: "getBounty",
    args: [BOUNTY_ID],
  });

  console.log("Bounty", BOUNTY_ID.toString());
  console.log("  title:", bounty[1]);
  console.log("  judged:", bounty[5], "finalized:", bounty[6]);
  console.log("  submissions:", bounty[7].toString());

  if (bounty[6]) {
    console.log("Already finalized. Winner:", bounty[8].toString());
    return;
  }

  if (!bounty[5]) {
    const walletBal = await publicClient.readContract({
      address: RITUAL_WALLET,
      abi: [
        {
          name: "balanceOf",
          type: "function",
          stateMutability: "view",
          inputs: [{ name: "account", type: "address" }],
          outputs: [{ type: "uint256" }],
        },
        {
          name: "lockUntil",
          type: "function",
          stateMutability: "view",
          inputs: [{ name: "account", type: "address" }],
          outputs: [{ type: "uint256" }],
        },
      ],
      functionName: "balanceOf",
      args: [ownerAccount.address],
    });

    console.log("RitualWallet balance:", walletBal.toString());

    if (walletBal < MIN_LLM_BALANCE) {
      const topUp = MIN_LLM_BALANCE - walletBal;
      console.log(
        `Depositing ${(Number(topUp) / 1e18).toFixed(3)} RITUAL to RitualWallet (target ${(Number(MIN_LLM_BALANCE) / 1e18).toFixed(2)})...`,
      );
      const dep = await owner.writeContract({
        address: RITUAL_WALLET,
        abi: [
          {
            name: "deposit",
            type: "function",
            stateMutability: "payable",
            inputs: [{ name: "lockDuration", type: "uint256" }],
            outputs: [],
          },
        ],
        functionName: "deposit",
        args: [LOCK_DURATION],
        value: topUp,
      });
      await publicClient.waitForTransactionReceipt({ hash: dep });
    }

    const services = await publicClient.readContract({
      address: TEE_REGISTRY,
      abi: teeRegistryAbi,
      functionName: "getServicesByCapability",
      args: [1, true],
    });
    const executor = services[0].node.teeAddress as Address;
    console.log("Executor:", executor);

    const subs = [];
    for (let i = 0; i < Number(bounty[7]); i++) {
      const row = await publicClient.readContract({
        address: CONTRACT,
        abi: judgeAbi,
        functionName: "getSubmission",
        args: [BOUNTY_ID, BigInt(i)],
      });
      subs.push({
        index: i,
        submitter: row[0] as Address,
        encryptedAnswer: row[1] as Hex,
        secretSignature: row[2] as Hex,
        secretKey: row[4] as string,
      });

      const [hasAccess] = await publicClient.readContract({
        address: SECRETS_AC,
        abi: [
          {
            name: "checkAccess",
            type: "function",
            stateMutability: "view",
            inputs: [
              { name: "owner", type: "address" },
              { name: "delegate", type: "address" },
              { name: "secretsHash", type: "bytes32" },
            ],
            outputs: [{ type: "bool" }, { type: "tuple", components: [] }],
          },
        ],
        functionName: "checkAccess",
        args: [row[0] as Address, ownerAccount.address, row[3]],
      });
      console.log(`  sub ${i} access granted:`, hasAccess);
    }

    const llmInput = buildLlmInput(executor, bounty[1], bounty[2], subs);
    console.log("Calling judgeAll (async LLM — may take several minutes)...");
    const judgeHash = await owner.writeContract({
      address: CONTRACT,
      abi: judgeAbi,
      functionName: "judgeAll",
      args: [BOUNTY_ID, llmInput],
      gas: 8_000_000n,
    });
    console.log("Judge tx submitted:", judgeHash);
    try {
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: judgeHash,
        timeout: 600_000,
        pollingInterval: 5_000,
      });
      console.log("Judge status:", receipt.status, "tx:", judgeHash);
    } catch (e) {
      console.log(
        "Receipt wait timed out — polling bounty state (async LLM may still settle)…",
      );
      await waitForJudged(publicClient, BOUNTY_ID, judgeHash);
    }
  }

  const after = await publicClient.readContract({
    address: CONTRACT,
    abi: judgeAbi,
    functionName: "getBounty",
    args: [BOUNTY_ID],
  });

  if (!after[5]) {
    throw new Error("judgeAll did not set judged=true");
  }

  const winnerIndex = parseWinner(after[9] as Hex);
  console.log("AI winner index:", winnerIndex);

  console.log("Finalizing winner...");
  const finHash = await owner.writeContract({
    address: CONTRACT,
    abi: judgeAbi,
    functionName: "finalizeWinner",
    args: [BOUNTY_ID, BigInt(winnerIndex)],
  });
  await publicClient.waitForTransactionReceipt({ hash: finHash });
  console.log("Finalize tx:", finHash);

  const final = await publicClient.readContract({
    address: CONTRACT,
    abi: judgeAbi,
    functionName: "getBounty",
    args: [BOUNTY_ID],
  });
  console.log("\nDONE — bounty finalized. Winner index:", final[8].toString());
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});