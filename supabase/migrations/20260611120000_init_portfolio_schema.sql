-- moya.terminal — portfolio schema (Supabase / Postgres)
--
-- Four-table layering, standard portfolio-accounting separation:
--   strategies      — reference / static definition (incl. exit_sequence)
--   daily_snapshots — valuations time-series (equity curve)
--   trade_log       — executions / fills (append-only, idempotent)
--   cash_flows      — capital in/out (kept distinct so return math stays correct)
--
-- Money is numeric (never float). Sync from the droplet uses partial-unique
-- (source, external_id) indexes so re-runs upsert instead of duplicating.

-- ---------------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------------
-- strategies — one row per strategy
-- ---------------------------------------------------------------------------
create table strategies (
  id             uuid primary key default gen_random_uuid(),
  slug           text unique not null,        -- stable human key, e.g. 'aave-arb-loop-1'
  name           text not null,
  type           text not null check (type in ('defi','bot','discretionary')),
  status         text not null default 'active'
                   check (status in ('active','paused','closed')),
  description    text,

  -- DeFi: wallets owned by this strategy (risk isolation). empty for bot/discretionary.
  wallets        text[] not null default '{}',
  -- bot: matches the PM2 process name in infra-api (e.g. 'storm').
  bot_ref        text,
  -- discretionary: CEX venues, e.g. {'hyperliquid','aster'}
  venues         text[] not null default '{}',

  -- Ordered exit path. JSONB array of step objects (see shape below). DeFi-centric.
  --   [{ "step": 1,
  --      "action": "repay|withdraw|sell|redeem|remove_liquidity|swap|unstake|claim",
  --      "protocol": "aave-v3", "chain": "arbitrum",
  --      "target": { "asset": "USDC", "market": "0x..." },
  --      "amount": { "type": "all" } | { "type": "percent", "value": 50 } | { "type": "fixed", "value": 1000 },
  --      "requires_approval": true,
  --      "depends_on": [],
  --      "description": "Repay all USDC debt on Aave Arbitrum" }]
  exit_sequence  jsonb not null default '[]'::jsonb,

  -- Alert thresholds. JSONB array:
  --   [{ "metric": "health_factor|apy|maturity_days|nav_drawdown",
  --      "op": "lt|gt", "value": 1.5, "severity": "warn|critical" }]
  alerts         jsonb not null default '[]'::jsonb,

  -- Freeform extension: target_apy, base_asset, inception_date, tags, etc.
  metadata       jsonb not null default '{}'::jsonb,

  -- Bumped when the exit_sequence/alerts shape changes, so app code can migrate safely.
  schema_version smallint not null default 1,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- Light structural guards (full shape is enforced app-side via the shared TS contract).
  constraint exit_sequence_is_array check (jsonb_typeof(exit_sequence) = 'array'),
  constraint alerts_is_array        check (jsonb_typeof(alerts) = 'array')
);

create trigger strategies_set_updated_at
  before update on strategies
  for each row execute function set_updated_at();

create index strategies_type_idx   on strategies(type);
create index strategies_status_idx on strategies(status);

-- ---------------------------------------------------------------------------
-- daily_snapshots — NAV time-series (equity curve)
-- ---------------------------------------------------------------------------
create table daily_snapshots (
  id           bigint generated always as identity primary key,
  strategy_id  uuid not null references strategies(id) on delete cascade,
  date         date not null,
  nav_usd      numeric(20,2) not null,      -- mark-to-market value
  pnl_usd      numeric(20,2),               -- day PnL (performance only)
  cum_pnl_usd  numeric(20,2),               -- since inception
  net_flow_usd numeric(20,2) not null default 0, -- deposits − withdrawals that day
  return_pct   numeric(10,4),               -- daily return, flow-adjusted (modified Dietz)
  metadata     jsonb not null default '{}'::jsonb, -- per-position/leg breakdown
  created_at   timestamptz not null default now(),
  unique (strategy_id, date)
);

create index daily_snapshots_date_idx on daily_snapshots(date);

-- ---------------------------------------------------------------------------
-- trade_log — executions / fills
-- ---------------------------------------------------------------------------
create table trade_log (
  id           bigint generated always as identity primary key,
  strategy_id  uuid references strategies(id) on delete set null,
  ts           timestamptz not null,
  venue        text not null,               -- 'aave-v3','pendle','hyperliquid','polymarket'…
  chain        text,                        -- null for CEX
  kind         text not null,               -- 'open','close','rebalance','exit_step','swap'…
  side         text,                        -- buy|sell|long|short|null
  asset        text,
  quantity     numeric(38,18),
  price_usd    numeric(30,10),
  value_usd    numeric(20,2),
  fee_usd      numeric(20,6),
  tx_hash      text,                        -- on-chain ref
  external_id  text,                        -- venue order/fill id
  notes        text,
  raw          jsonb not null default '{}'::jsonb, -- original source record
  created_at   timestamptz not null default now()
);

create index trade_log_strategy_ts_idx on trade_log(strategy_id, ts desc);
create index trade_log_venue_idx        on trade_log(venue);
-- Idempotent sync (droplet → Supabase): re-running an upsert won't duplicate.
create unique index trade_log_dedup_idx
  on trade_log(venue, external_id) where external_id is not null;

-- ---------------------------------------------------------------------------
-- cash_flows — external capital in/out (distinct from trades, for return math)
-- ---------------------------------------------------------------------------
create table cash_flows (
  id            bigint generated always as identity primary key,
  strategy_id   uuid not null references strategies(id) on delete cascade,
  ts            timestamptz not null,
  direction     text not null check (direction in ('in','out')),
  amount_usd    numeric(20,2) not null,
  asset         text,
  amount_native numeric(38,18),
  source        text,                        -- transfer|bridge|manual…
  tx_hash       text,
  external_id   text,
  notes         text,
  created_at    timestamptz not null default now()
);

create index cash_flows_strategy_ts_idx on cash_flows(strategy_id, ts desc);
create unique index cash_flows_dedup_idx
  on cash_flows(direction, external_id) where external_id is not null;

-- ---------------------------------------------------------------------------
-- Row Level Security
--   Writes come from the droplet sync using the service-role key (bypasses RLS).
--   moya.bio reads the public track record with the anon key — allow read-only.
-- ---------------------------------------------------------------------------
alter table strategies      enable row level security;
alter table daily_snapshots enable row level security;
alter table trade_log       enable row level security;
alter table cash_flows      enable row level security;

create policy anon_read_strategies      on strategies      for select using (true);
create policy anon_read_daily_snapshots on daily_snapshots for select using (true);
create policy anon_read_trade_log       on trade_log       for select using (true);
create policy anon_read_cash_flows      on cash_flows      for select using (true);
