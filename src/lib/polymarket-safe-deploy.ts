import {
  encodeFunctionData,
  encodePacked,
  concatHex,
  parseSignature,
  parseUnits,
  erc20Abi,
  pad,
  size,
  zeroAddress,
  type WalletClient,
  type Address,
  type Hex,
} from "viem";
import {
  SAFE_FACTORY,
  USDC_E,
  USDC_E_DECIMALS,
  CTF,
  USDC_SPENDERS,
  CTF_OPERATORS,
} from "./polymarket-safe";

// B-alt: deploy the user's Polymarket Safe directly from their MetaMask (EOA pays
// the few-cent Polygon gas), instead of the gasless relayer (which needs builder
// credentials). The EOA signs the factory's CreateProxy EIP-712 message, then
// calls createProxy(paymentToken=0, payment=0, paymentReceiver=0, sig). The Safe
// is deployed deterministically (owner = EOA, salt = keccak(EOA)).
//
// NOTE: not verifiable locally - exact Sig struct shape (assumed {v,r,s}) and
// factory acceptance of a self-sent (msg.sender = signer) zero-payment call are
// confirmed on-chain only. Test the deploy first (Safe shows up on Polygonscan).

const SAFE_FACTORY_NAME = "Polymarket Contract Proxy Factory";

const FACTORY_ABI = [
  {
    type: "function",
    name: "createProxy",
    stateMutability: "nonpayable",
    inputs: [
      { name: "paymentToken", type: "address" },
      { name: "payment", type: "uint256" },
      { name: "paymentReceiver", type: "address" },
      {
        name: "createSig",
        type: "tuple",
        components: [
          { name: "v", type: "uint8" },
          { name: "r", type: "bytes32" },
          { name: "s", type: "bytes32" },
        ],
      },
    ],
    outputs: [],
  },
] as const;

const CREATE_PROXY_TYPES = {
  CreateProxy: [
    { name: "paymentToken", type: "address" },
    { name: "payment", type: "uint256" },
    { name: "paymentReceiver", type: "address" },
  ],
} as const;

/** Build the EOA→factory createProxy transaction (signs CreateProxy first). */
export async function buildDeploySafe(
  wallet: WalletClient,
  eoa: Address,
): Promise<{ to: Address; data: `0x${string}` }> {
  const sig = await wallet.signTypedData({
    account: eoa,
    domain: {
      name: SAFE_FACTORY_NAME,
      chainId: 137,
      verifyingContract: SAFE_FACTORY,
    },
    types: CREATE_PROXY_TYPES,
    primaryType: "CreateProxy",
    message: {
      paymentToken: zeroAddress,
      payment: BigInt(0),
      paymentReceiver: zeroAddress,
    },
  });
  const { r, s, v } = parseSignature(sig);
  const data = encodeFunctionData({
    abi: FACTORY_ABI,
    functionName: "createProxy",
    args: [zeroAddress, BigInt(0), zeroAddress, { v: Number(v), r, s }],
  });
  return { to: SAFE_FACTORY, data };
}

// ---------------------------------------------------------------------------
// B-alt: set token approvals directly from the EOA (no relayer). The owner
// (EOA) submits Safe.execTransaction itself, so msg.sender == owner: Gnosis
// Safe accepts a "pre-validated" signature {r: owner, s: 0, v: 1} with NO
// SafeTx signing popup - the user just confirms the single on-chain tx.
// All 7 approvals (USDC.e → 4 spenders, CTF → 3 operators) are batched through
// the Polymarket SafeMultisend via delegatecall, so it's one MetaMask confirm.

const SAFE_MULTISEND: Address = "0xA238CBeb142c10Ef7Ad8442C6D1f9E89e07e7761";
const MAX_UINT256 = BigInt(
  "115792089237316195423570985008687907853269984665640564039457584007913129639935",
);

const MULTISEND_ABI = [
  {
    type: "function",
    name: "multiSend",
    stateMutability: "nonpayable",
    inputs: [{ name: "transactions", type: "bytes" }],
    outputs: [],
  },
] as const;

const SET_APPROVAL_FOR_ALL_ABI = [
  {
    type: "function",
    name: "setApprovalForAll",
    stateMutability: "nonpayable",
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" },
    ],
    outputs: [],
  },
] as const;

const EXEC_TRANSACTION_ABI = [
  {
    type: "function",
    name: "execTransaction",
    stateMutability: "payable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "data", type: "bytes" },
      { name: "operation", type: "uint8" },
      { name: "safeTxGas", type: "uint256" },
      { name: "baseGas", type: "uint256" },
      { name: "gasPrice", type: "uint256" },
      { name: "gasToken", type: "address" },
      { name: "refundReceiver", type: "address" },
      { name: "signatures", type: "bytes" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

type InnerTx = { to: Address; data: Hex };

function approvalInnerTxs(): InnerTx[] {
  const txs: InnerTx[] = [];
  for (const spender of USDC_SPENDERS) {
    txs.push({
      to: USDC_E,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [spender, MAX_UINT256],
      }),
    });
  }
  for (const op of CTF_OPERATORS) {
    txs.push({
      to: CTF,
      data: encodeFunctionData({
        abi: SET_APPROVAL_FOR_ALL_ABI,
        functionName: "setApprovalForAll",
        args: [op, true],
      }),
    });
  }
  return txs;
}

/** MultiSend packed bytes: each tx = (uint8 op, address to, uint256 value, uint256 len, bytes data). */
function packMultiSend(txs: InnerTx[]): Hex {
  return concatHex(
    txs.map((tx) =>
      encodePacked(
        ["uint8", "address", "uint256", "uint256", "bytes"],
        [0, tx.to, BigInt(0), BigInt(size(tx.data)), tx.data],
      ),
    ),
  );
}

/**
 * Build the EOA→Safe execTransaction that batch-sets every trading approval.
 * No signature popup (pre-validated owner sig); user confirms one tx that pays
 * a few cents of Polygon gas.
 */
export function buildSetApprovals(
  eoa: Address,
  safe: Address,
): { to: Address; data: Hex } {
  const multiSendData = encodeFunctionData({
    abi: MULTISEND_ABI,
    functionName: "multiSend",
    args: [packMultiSend(approvalInnerTxs())],
  });
  // Pre-validated signature for an owner who is msg.sender: r=owner, s=0, v=1.
  const signatures = concatHex([
    pad(eoa, { size: 32 }),
    pad("0x", { size: 32 }),
    "0x01",
  ]);
  const data = encodeFunctionData({
    abi: EXEC_TRANSACTION_ABI,
    functionName: "execTransaction",
    args: [
      SAFE_MULTISEND,
      BigInt(0),
      multiSendData,
      1, // operation: DelegateCall (multiSend must be delegatecalled)
      BigInt(0),
      BigInt(0),
      BigInt(0),
      zeroAddress,
      zeroAddress,
      signatures,
    ],
  });
  return { to: safe, data };
}

/** Pre-validated owner signature (r=owner, s=0, v=1) - valid when the owner is
 * msg.sender, so no SafeTx signing popup is needed. */
function preValidatedSig(eoa: Address): Hex {
  return concatHex([pad(eoa, { size: 32 }), pad("0x", { size: 32 }), "0x01"]);
}

/**
 * Withdraw USDC.e from the Safe back to the EOA. A single execTransaction wrapping
 * an ERC20 transfer(EOA, amount) - the owner submits it themselves (msg.sender ==
 * owner), so it's one tx, no extra signature. `amount` is a human string ("10").
 */
export function buildSafeWithdraw(
  eoa: Address,
  safe: Address,
  amount: string,
): { to: Address; data: Hex } {
  const inner = encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [eoa, parseUnits(amount, USDC_E_DECIMALS)],
  });
  const data = encodeFunctionData({
    abi: EXEC_TRANSACTION_ABI,
    functionName: "execTransaction",
    args: [
      USDC_E,
      BigInt(0),
      inner,
      0, // operation: Call
      BigInt(0),
      BigInt(0),
      BigInt(0),
      zeroAddress,
      zeroAddress,
      preValidatedSig(eoa),
    ],
  });
  return { to: safe, data };
}
