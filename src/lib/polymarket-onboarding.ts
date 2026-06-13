import {
  RelayClient,
  RelayerTransactionState,
  OperationType,
  type SafeTransaction,
} from "@polymarket/builder-relayer-client";
import {
  createPublicClient,
  http,
  encodeFunctionData,
  erc20Abi,
  parseUnits,
  type WalletClient,
  type Address,
} from "viem";
import { polygon } from "viem/chains";
import { RPC } from "@/config/chains";
import {
  USDC_E,
  USDC_E_DECIMALS,
  CTF,
  USDC_SPENDERS,
  CTF_OPERATORS,
} from "./polymarket-safe";

// Client-side onboarding for Polymarket's Safe account model:
//   derive → deploy (gasless via relayer) → approve (gasless) → fund (EOA→Safe).
// Read-only chain calls go to Polygon RPC (no geo-block). Deploy/approve go
// through the relayer (RelayClient → /api/pm-relay → proxy → relayer-v2).

const MAX_UINT256 = BigInt(
  "115792089237316195423570985008687907853269984665640564039457584007913129639935",
);
const APPROVAL_THRESHOLD = BigInt("1000000000000"); // 1M USDC (6dp)

const erc1155Abi = [
  {
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" },
    ],
    name: "setApprovalForAll",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "account", type: "address" },
      { name: "operator", type: "address" },
    ],
    name: "isApprovedForAll",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const publicClient = createPublicClient({
  chain: polygon,
  transport: http(RPC.polygon),
});

export function relayClient(wallet: WalletClient): RelayClient {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  // builderConfig omitted (optional - no builder attribution / no remote signer).
  return new RelayClient(`${base}/api/pm-relay`, 137, wallet);
}

export async function isSafeDeployed(safe: Address): Promise<boolean> {
  const code = await publicClient.getCode({ address: safe });
  return !!code && code !== "0x";
}

export async function usdcBalance(addr: Address): Promise<number> {
  const raw = await publicClient.readContract({
    address: USDC_E,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [addr],
  });
  return Number(raw) / 10 ** USDC_E_DECIMALS;
}

export async function checkApprovals(safe: Address): Promise<boolean> {
  const [usdc, ctf] = await Promise.all([
    Promise.all(
      USDC_SPENDERS.map((s) =>
        publicClient.readContract({
          address: USDC_E,
          abi: erc20Abi,
          functionName: "allowance",
          args: [safe, s],
        }),
      ),
    ),
    Promise.all(
      CTF_OPERATORS.map((o) =>
        publicClient.readContract({
          address: CTF,
          abi: erc1155Abi,
          functionName: "isApprovedForAll",
          args: [safe, o],
        }),
      ),
    ),
  ]);
  return usdc.every((a) => a >= APPROVAL_THRESHOLD) && ctf.every(Boolean);
}

function approvalTxs(): SafeTransaction[] {
  const txs: SafeTransaction[] = [];
  for (const s of USDC_SPENDERS) {
    txs.push({
      to: USDC_E,
      operation: OperationType.Call,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [s, MAX_UINT256],
      }),
      value: "0",
    });
  }
  for (const o of CTF_OPERATORS) {
    txs.push({
      to: CTF,
      operation: OperationType.Call,
      data: encodeFunctionData({
        abi: erc1155Abi,
        functionName: "setApprovalForAll",
        args: [o, true],
      }),
      value: "0",
    });
  }
  return txs;
}

/** Gasless Safe deployment via the relayer (one wallet signature, relayer pays gas). */
export async function deploySafe(rc: RelayClient): Promise<void> {
  const resp = await rc.deploy();
  await rc.pollUntilState(
    resp.transactionID,
    [
      RelayerTransactionState.STATE_MINED,
      RelayerTransactionState.STATE_CONFIRMED,
      RelayerTransactionState.STATE_FAILED,
    ],
    "60",
    3000,
  );
}

/** Gasless batch approvals (USDC → 4 spenders, CTF → 3 operators). */
export async function setApprovals(rc: RelayClient): Promise<void> {
  const resp = await rc.execute(approvalTxs(), "Set token approvals for trading");
  await resp.wait();
}

/** Build the ERC20 transfer args to fund the Safe from the EOA (use with wagmi writeContract). */
export function fundSafeTx(safe: Address, amount: string) {
  return {
    address: USDC_E,
    abi: erc20Abi,
    functionName: "transfer" as const,
    args: [safe, parseUnits(amount, USDC_E_DECIMALS)] as const,
  };
}
