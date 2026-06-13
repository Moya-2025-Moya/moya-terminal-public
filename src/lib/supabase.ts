import { createClient } from "@supabase/supabase-js";

// Shared data layer (strategies, daily_snapshots, trade_log, cash_flows).
// The browser client uses the anon key; server-only writes should use a
// separate service-role client (not exposed here).

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let _client: ReturnType<typeof createClient> | null = null;

export function getSupabase() {
  if (!url || !anonKey) {
    throw new Error(
      "Supabase env not configured - set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }
  if (!_client) _client = createClient(url, anonKey);
  return _client;
}

export const isSupabaseConfigured = () => Boolean(url && anonKey);
