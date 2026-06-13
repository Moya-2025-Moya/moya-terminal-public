# Supabase schema

Shared data layer for moya.terminal + moya.bio. Tables: `strategies`, `daily_snapshots`, `trade_log`, `cash_flows`. See the design rationale in the migration header.

## Apply

The TS row types in [`src/lib/types.ts`](../src/lib/types.ts) are the matching app-side contract — keep them in sync with the SQL.

**Option A — Supabase CLI** (if linked):
```bash
supabase db push
```

**Option B — SQL editor**: paste `migrations/20260611120000_init_portfolio_schema.sql` into the Supabase dashboard SQL editor and run.

## Writes vs reads

- The droplet sync writes with the **service-role key** (bypasses RLS).
- moya.bio reads the public track record with the **anon key** — RLS policies allow `select` only. No anon writes.
