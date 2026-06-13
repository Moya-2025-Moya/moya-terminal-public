import { createConfig, http } from "wagmi";
import { mainnet, arbitrum, base, bsc, polygon } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { RPC } from "@/config/chains";

// The terminal never holds keys - all on-chain ops are pushed to the browser
// wallet (MetaMask / Rabby) to sign. injected() covers both.
// Polygon is included for Polymarket (CLOB orders are EIP-712 signed on 137).
export const wagmiConfig = createConfig({
  chains: [mainnet, arbitrum, base, bsc, polygon],
  connectors: [injected()],
  transports: {
    [mainnet.id]: http(RPC.ethereum),
    [arbitrum.id]: http(RPC.arbitrum),
    [base.id]: http(RPC.base),
    [bsc.id]: http(RPC.bnb),
    [polygon.id]: http(RPC.polygon),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
