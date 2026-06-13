import {
  RelayClient,
  type DepositWalletCall,
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
import { CTF, USDC_E, USDC_E_DECIMALS } from "./polymarket-safe";

// Polymarket migrated to its own collateral stablecoin pUSD (Polymarket USD) and
// a new set of exchange contracts. The deposit wallet holds pUSD; CLOB checks
// pUSD allowance to these exchanges (verified on-chain via getBalanceAllowance).
// USDC.e / the old CTF_EXCHANGE are no longer what the deposit-wallet model uses.
const PUSD: Address = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB";
const PUSD_DECIMALS = 6;
// The three spenders CLOB checks for COLLATERAL allowance on a deposit wallet.
const PUSD_SPENDERS: readonly Address[] = [
  "0xE111180000d2663C0091e4f400237545B87B996B", // new CTF exchange
  "0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296", // neg-risk adapter
  "0xe2222d279d744050d28e00520010520000310F59", // new neg-risk exchange
];
// Same exchanges operate the conditional (CTF) tokens.
const CTF_OPERATORS_V2: readonly Address[] = PUSD_SPENDERS;

// Polymarket's current account model: funds and positions live in a deterministic
// deposit wallet (UUPS/beacon proxy). Deploy + approvals + withdrawals run GASLESS
// through Polymarket's relayer, authenticated server-side via POLY_BUILDER_* on our
// proxy (pm-forward). That lets a geo-blocked client transact with no gas and no
// VPN - the official SDK builds + signs each request; we only attach builder auth
// at the edge. No reverse-engineered factory calldata anywhere.

const MAX_UINT256 = BigInt(
  "115792089237316195423570985008687907853269984665640564039457584007913129639935",
);
const APPROVAL_THRESHOLD = BigInt("1000000000000"); // 1M USDC (6dp)
const APPROVAL_DEADLINE_SECONDS = 10 * 60;

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
  return new RelayClient(`${base}/api/pm-relay`, 137, wallet);
}

// Deterministic per EOA - derive once (it does an RPC beacon check), then cache.
// Without this, every useAccountSummary poll across every component re-derives →
// RPC storm + jank.
const depositWalletCache = new Map<string, Address>();
export async function depositWalletAddressFor(wallet: WalletClient): Promise<Address> {
  const eoa = wallet.account?.address?.toLowerCase();
  if (eoa && depositWalletCache.has(eoa)) return depositWalletCache.get(eoa)!;
  const dw = (await relayClient(wallet).deriveDepositWalletAddress()) as Address;
  if (eoa) depositWalletCache.set(eoa, dw);
  return dw;
}

export async function isDepositWalletDeployed(walletAddress: Address): Promise<boolean> {
  const code = await publicClient.getCode({ address: walletAddress });
  return !!code && code !== "0x";
}

/** EOA's USDC.e balance (what the user can fund with). */
export async function usdcBalance(addr: Address): Promise<number> {
  const raw = await publicClient.readContract({
    address: USDC_E,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [addr],
  });
  return Number(raw) / 10 ** USDC_E_DECIMALS;
}

/** The deposit wallet's tradeable collateral = its pUSD balance. */
export async function pusdBalance(addr: Address): Promise<number> {
  const raw = await publicClient.readContract({
    address: PUSD,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [addr],
  });
  return Number(raw) / 10 ** PUSD_DECIMALS;
}

export async function checkApprovals(walletAddress: Address): Promise<boolean> {
  const [pusd, ctf] = await Promise.all([
    Promise.all(
      PUSD_SPENDERS.map((spender) =>
        publicClient.readContract({
          address: PUSD,
          abi: erc20Abi,
          functionName: "allowance",
          args: [walletAddress, spender],
        }),
      ),
    ),
    Promise.all(
      CTF_OPERATORS_V2.map((operator) =>
        publicClient.readContract({
          address: CTF,
          abi: erc1155Abi,
          functionName: "isApprovedForAll",
          args: [walletAddress, operator],
        }),
      ),
    ),
  ]);
  return pusd.every((allowance) => allowance >= APPROVAL_THRESHOLD) && ctf.every(Boolean);
}

function approvalCalls(): DepositWalletCall[] {
  const calls: DepositWalletCall[] = [];
  for (const spender of PUSD_SPENDERS) {
    calls.push({
      target: PUSD,
      value: "0",
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [spender, MAX_UINT256],
      }),
    });
  }
  for (const operator of CTF_OPERATORS_V2) {
    calls.push({
      target: CTF,
      value: "0",
      data: encodeFunctionData({
        abi: erc1155Abi,
        functionName: "setApprovalForAll",
        args: [operator, true],
      }),
    });
  }
  return calls;
}

function parseUsdcAmount(amount: string): bigint {
  const trimmed = amount.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(trimmed)) {
    throw new Error("Enter a valid USDC.e amount with up to 6 decimals.");
  }
  const parsed = parseUnits(trimmed, USDC_E_DECIMALS);
  if (parsed <= BigInt(0)) throw new Error("Amount must be greater than 0.");
  return parsed;
}

function batchDeadline(): string {
  return String(Math.floor(Date.now() / 1000) + APPROVAL_DEADLINE_SECONDS);
}

/** Deploy the deposit wallet - gasless via the relayer (no MetaMask tx). */
export async function deployDepositWallet(wallet: WalletClient): Promise<void> {
  const resp = await relayClient(wallet).deployDepositWallet();
  await resp.wait();
}

/** Set all trading approvals - gasless. One typed-data signature; relayer executes. */
export async function setDepositWalletApprovals(
  wallet: WalletClient,
  walletAddress: Address,
): Promise<void> {
  const resp = await relayClient(wallet).executeDepositWalletBatch(
    approvalCalls(),
    walletAddress,
    batchDeadline(),
  );
  await resp.wait();
}

/** Withdraw USDC.e from the deposit wallet to any recipient - gasless. */
export async function withdrawDepositWallet(
  wallet: WalletClient,
  walletAddress: Address,
  recipient: Address,
  amount: string,
): Promise<void> {
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [recipient, parseUsdcAmount(amount)],
  });
  const resp = await relayClient(wallet).executeDepositWalletBatch(
    [{ target: USDC_E, value: "0", data }],
    walletAddress,
    batchDeadline(),
  );
  await resp.wait();
}

/** Fund the deposit wallet from the EOA (a plain USDC transfer - EOA pays gas). */
export function fundDepositWalletTx(walletAddress: Address, amount: string) {
  return {
    address: USDC_E,
    abi: erc20Abi,
    functionName: "transfer" as const,
    args: [walletAddress, parseUsdcAmount(amount)] as const,
  };
}
