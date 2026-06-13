// Core domain model for moya.terminal.
//
// The strategy / exit-sequence / snapshot / trade / cash-flow types below mirror
// the Supabase schema in supabase/migrations/20260611120000_init_portfolio_schema.sql
// (snake_case to match the rows returned by the Supabase JS client). This is the
// shared contract that also enforces the exit_sequence JSON shape app-side.

export type StrategyType = "defi" | "bot" | "discretionary";

export type StrategyStatus = "active" | "paused" | "closed";

export type ExitAction =
  | "repay"
  | "withdraw"
  | "sell"
  | "redeem"
  | "remove_liquidity"
  | "swap"
  | "unstake"
  | "claim";

/** How much of a position a step acts on. */
export type ExitAmount =
  | { type: "all" }
  | { type: "percent"; value: number }
  | { type: "fixed"; value: number };

/** One ordered step in a strategy's predefined unwind path. */
export interface ExitStep {
  step: number;
  action: ExitAction;
  protocol: string; // 'aave-v3', 'pendle', 'uniswap-v3'…
  chain: string; // 'ethereum', 'arbitrum', 'base', 'bnb'
  target: { asset: string; market?: string; pool?: string };
  amount: ExitAmount;
  requires_approval?: boolean; // ERC20 approve needed first
  depends_on?: number[]; // step numbers that must finish before this one
  description: string;
}

export type AlertMetric =
  | "health_factor"
  | "apy"
  | "maturity_days"
  | "nav_drawdown";

export interface AlertThreshold {
  metric: AlertMetric;
  op: "lt" | "gt";
  value: number;
  severity: "warn" | "critical";
}

/** A row of the `strategies` table. */
export interface Strategy {
  id: string;
  slug: string;
  name: string;
  type: StrategyType;
  status: StrategyStatus;
  description?: string | null;
  wallets: string[];
  bot_ref?: string | null;
  venues: string[];
  exit_sequence: ExitStep[];
  alerts: AlertThreshold[];
  metadata: Record<string, unknown>;
  schema_version: number;
  created_at: string;
  updated_at: string;
}

/** A row of `daily_snapshots`. */
export interface DailySnapshot {
  id: number;
  strategy_id: string;
  date: string; // ISO date
  nav_usd: number;
  pnl_usd: number | null;
  cum_pnl_usd: number | null;
  net_flow_usd: number;
  return_pct: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** A row of `trade_log`. */
export interface TradeLogEntry {
  id: number;
  strategy_id: string | null;
  ts: string;
  venue: string;
  chain?: string | null;
  kind: string;
  side?: "buy" | "sell" | "long" | "short" | null;
  asset?: string | null;
  quantity?: number | null;
  price_usd?: number | null;
  value_usd?: number | null;
  fee_usd?: number | null;
  tx_hash?: string | null;
  external_id?: string | null;
  notes?: string | null;
  raw: Record<string, unknown>;
  created_at: string;
}

/** A row of `cash_flows`. */
export interface CashFlow {
  id: number;
  strategy_id: string;
  ts: string;
  direction: "in" | "out";
  amount_usd: number;
  asset?: string | null;
  amount_native?: number | null;
  source?: string | null;
  tx_hash?: string | null;
  external_id?: string | null;
  notes?: string | null;
  created_at: string;
}

// --- DeFi cache (zerion-fetcher read API on the droplet) ---------------------
// These mirror the fetcher's responses, not Zerion directly. See lib/zerion.ts.

/** One row from GET /defi/positions (the fetcher's SQLite cache shape). */
export interface CachedPosition {
  id: string;
  wallet: string;
  chain: string | null;
  protocol: string | null;
  position_type: string | null; // deposit|loan|locked|staked|reward|wallet
  symbol: string | null;
  name: string | null;
  quantity: number | null;
  price: number | null;
  value_usd: number | null;
  is_debt: 0 | 1;
  fungible_id: string | null;
  zerion_updated_at: string | null;
  fetched_at: string;
}

/** GET /defi/summary. */
export interface DefiSummary {
  assets_usd: number;
  debt_usd: number;
  net_usd: number;
  by_wallet: { wallet: string; net_usd: number }[];
  by_chain: { chain: string | null; value_usd: number }[];
  by_protocol: { protocol: string | null; value_usd: number }[];
}

/** One entry from GET /defi/wallets (configured wallet + last fetch status). */
export interface DefiWalletStatus {
  address: string;
  label: string | null;
  strategy_slug: string | null;
  last_fetch: {
    wallet: string;
    started_at: string;
    status: string; // ok|error
    http_status: number | null;
    position_count: number | null;
    error: string | null;
  } | null;
}

/** Bucket 2 - a remotely-managed bot. */
export interface BotStatus {
  name: string;
  state: "running" | "paused" | "error";
  pnlUsd?: number;
  lastActionAt?: string;
  lastLogLine?: string;
}

/**
 * Bucket 2.5 - a PM2 process on the droplet, via the Infra API.
 * Shape mirrors the live API response (snake_case, verified against
 * the Infra API /infra/processes endpoint).
 */
export interface ProcessStatus {
  name: string;
  pm_id: number;
  status: "online" | "stopped" | "errored" | (string & {});
  uptime_ms: number;
  cpu: number; // percent
  memory_mb: number;
  restart_count: number;
}

/** Live shape from GET /infra/system. */
export interface SystemStats {
  cpu_percent: number;
  memory: { total_mb: number; used_mb: number; percent: number };
  disk: { total_gb: number; used_gb: number; percent: number };
  uptime_hours: number;
}

/** Live shape from GET /infra/logs/:name and /infra/logs/:name/error. */
export interface LogsResponse {
  name: string;
  lines: string[];
  count: number;
}

/** Bucket 3 - a read-only CEX position (Hyperliquid / Aster / Binance). */
export interface CexPosition {
  venue: "hyperliquid" | "aster" | "binance";
  symbol: string;
  side: "long" | "short";
  sizeUsd: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnlUsd: number;
}
