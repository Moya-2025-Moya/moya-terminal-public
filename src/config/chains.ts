// Alchemy RPC endpoints. Provide your own key via NEXT_PUBLIC_ALCHEMY_KEY,
// or override individual chains with NEXT_PUBLIC_RPC_* env vars.
const ALCHEMY_KEY = process.env.NEXT_PUBLIC_ALCHEMY_KEY ?? "";

const alchemy = (subdomain: string) =>
  `https://${subdomain}.g.alchemy.com/v2/${ALCHEMY_KEY}`;

export const RPC = {
  ethereum: process.env.NEXT_PUBLIC_RPC_ETHEREUM ?? alchemy("eth-mainnet"),
  arbitrum: process.env.NEXT_PUBLIC_RPC_ARBITRUM ?? alchemy("arb-mainnet"),
  bnb: process.env.NEXT_PUBLIC_RPC_BNB ?? alchemy("bnb-mainnet"),
  base: process.env.NEXT_PUBLIC_RPC_BASE ?? alchemy("base-mainnet"),
  polygon: process.env.NEXT_PUBLIC_RPC_POLYGON ?? alchemy("polygon-mainnet"),
  // Solana is non-EVM - not used by wagmi, kept here for Zerion / read-only paths.
  solana: process.env.NEXT_PUBLIC_RPC_SOLANA ?? alchemy("solana-mainnet"),
} as const;

export type SupportedChain = keyof typeof RPC;
