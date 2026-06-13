# moya.terminal

统一策略操作台 — monitoring + ops for every strategy (DeFi, bots, discretionary) in one place.

Next.js 16 (App Router) · React 19 · Tailwind v4 · wagmi v3 / viem · Supabase. Deploys to Railway as the single frontend service.

> This is a sanitized public copy: secrets, infra hostnames, and internal planning docs have been removed. Fill in your own `.env.local` and point the API URLs at your own backend.

## Buckets

| Route | Bucket | What |
|-------|--------|------|
| `/` | Overview | Global exposure, overall PnL, cross-strategy state |
| `/defi` | 1 — DeFi | Multi-wallet Zerion aggregate, health/APY/maturity, predefined exit sequences (browser-signed) |
| `/bots` | 2 — Bots | Remote status / pause-resume for trading bots |
| `/infra` | 2.5 — Infra | PM2 process status + logs via the Infra API |
| `/discretionary` | 3 — Discretionary | Read-only CEX (Hyperliquid + Aster) + on-chain holdings |
| `/polymarket` | — | Polymarket smart-money / insider tracking + execution |

## Layout

```
src/
  app/                  route per bucket + root layout (sidebar, wallet button, providers)
  components/           Sidebar, WalletButton, ui/ primitives
  config/chains.ts      Alchemy RPC endpoints (set NEXT_PUBLIC_ALCHEMY_KEY)
  lib/
    wagmi.ts            wallet config (injected — MetaMask/Rabby; terminal holds no keys)
    supabase.ts         shared data layer client
    infra-api.ts        Infra API client (server-side, bearer auth)
    zerion.ts           DeFi data source client
    types.ts            domain model
```

## Develop

```bash
cp .env.example .env.local   # fill in keys (Supabase, Infra API, Zerion, CEX, Telegram)
npm install
npm run dev                  # http://localhost:3000
npm run build                # production build
```

The app runs with no env set — buckets show "pending" states until their data sources are wired. Set `NEXT_PUBLIC_ALCHEMY_KEY` so wallet connect / read-only RPC works.

## Backend (not included)

The terminal is the frontend/remote; the data + execution backends are separate services you supply:

- **Zerion fetcher** — cron → SQLite cache that `lib/zerion.ts` reads from.
- **Infra API** — `/infra/processes`, `/infra/logs/:name`, `/infra/system`, `POST /infra/restart/:name`.
- **Polymarket CLOB proxy** — transparent reverse proxy to `clob.polymarket.com`.
- **CEX read-only** clients (Hyperliquid + Aster).

Point `INFRA_API_URL`, `DEFI_API_URL`, and `POLYMARKET_PROXY_URL` at your own hosts.
