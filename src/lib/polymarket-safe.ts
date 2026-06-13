import { deriveSafe } from "@polymarket/builder-relayer-client";
import type { Address } from "viem";

// Legacy Safe constants plus shared Polymarket token/exchange addresses. The
// active trading flow now uses deposit wallets in polymarket-deposit-wallet.ts.

// Polygon (137) contract addresses.
export const SAFE_FACTORY = "0xaacfeea03eb1561c4e67d661e40682bd20e3541b" as const;
export const USDC_E = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174" as const;
export const USDC_E_DECIMALS = 6;
export const CTF = "0x4d97dcd97ec945f40cf65f87097ace5ea0476045" as const;
export const CTF_EXCHANGE = "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E" as const;
export const NEG_RISK_CTF_EXCHANGE = "0xC5d563A36AE78145C45a50134d48A1215220f80a" as const;
export const NEG_RISK_ADAPTER = "0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296" as const;
export const RELAYER_URL = "https://relayer-v2.polymarket.com/";

// Legacy MetaMask EOA -> Polymarket Gnosis Safe proxy address (CREATE2, local-only).
export function safeAddressFor(eoa: Address): Address {
  return deriveSafe(eoa, SAFE_FACTORY) as Address;
}

// USDC.e spenders that the Safe must approve (ERC20 approve).
export const USDC_SPENDERS = [CTF, NEG_RISK_ADAPTER, CTF_EXCHANGE, NEG_RISK_CTF_EXCHANGE] as const;
// CTF (ERC1155) operators the Safe must setApprovalForAll.
export const CTF_OPERATORS = [CTF_EXCHANGE, NEG_RISK_CTF_EXCHANGE, NEG_RISK_ADAPTER] as const;
