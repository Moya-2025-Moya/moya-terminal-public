import type {
  CachedPosition,
  DefiSummary,
  DefiWalletStatus,
} from "./types";

// DeFi data client. Reads the droplet's zerion-fetcher cache (NOT Zerion
// directly) - the fetcher pulls Zerion every ~5 min into SQLite and serves it
// here. Same pattern as lib/infra-api.ts: server-side only, bearer auth, the
// token never reaches the browser.
//
//   GET  /defi/positions?wallet=&chain=&type=
//   GET  /defi/summary
//   GET  /defi/wallets
//   POST /defi/wallets   body { address, label?, strategy_slug? }

const BASE = process.env.DEFI_API_URL; // e.g. http://YOUR_INFRA_HOST:3002
const TOKEN = process.env.INFRA_API_TOKEN; // shared bearer token with infra-api

function headers(): Record<string, string> {
  if (!BASE || !TOKEN) {
    throw new Error(
      "DeFi API not configured - set DEFI_API_URL and INFRA_API_TOKEN",
    );
  }
  return { Authorization: `Bearer ${TOKEN}` };
}

// Cached 20s - the Zerion cache only refreshes every 5 min server-side, so a
// short revalidate makes navigation instant without showing stale data.
async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: headers(),
    next: { revalidate: 20 },
  });
  if (!res.ok) throw new Error(`DeFi API ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export interface AddWalletInput {
  address: string;
  label?: string;
  strategy_slug?: string;
}

export const defiApi = {
  summary: () => get<DefiSummary>("/defi/summary"),
  positions: (opts?: { wallet?: string; chain?: string; type?: string }) => {
    const q = new URLSearchParams();
    if (opts?.wallet) q.set("wallet", opts.wallet);
    if (opts?.chain) q.set("chain", opts.chain);
    if (opts?.type) q.set("type", opts.type);
    const qs = q.toString();
    return get<{ positions: CachedPosition[] }>(
      `/defi/positions${qs ? `?${qs}` : ""}`,
    );
  },
  wallets: () => get<{ wallets: DefiWalletStatus[] }>("/defi/wallets"),

  // Write path. The fetcher's POST /defi/wallets endpoint is still being built;
  // this assumes body { address, label?, strategy_slug? }.
  addWallet: async (body: AddWalletInput) => {
    const res = await fetch(`${BASE}/defi/wallets`, {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `DeFi API POST /defi/wallets → ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
      );
    }
    return res.json().catch(() => ({}));
  },
};

export const isDefiConfigured = () => Boolean(BASE && TOKEN);
