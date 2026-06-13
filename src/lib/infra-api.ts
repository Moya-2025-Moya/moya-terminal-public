import type { ProcessStatus, SystemStats, LogsResponse } from "./types";

// Unified position from the backend /positions store (pm + defi + bot).
// One row, exactly these 14 fields.
export interface UnifiedPosition {
  id: string;
  source: string;
  strategy: string | null;
  market: string;
  symbol: string;
  side: string | null;
  status: "open" | "closed";
  entry: number | null;
  size: number | null;
  realized: number | null;
  unrealized: number | null;
  opened_at: number | null;
  closed_at: number | null;
  url: string | null;
}

// Client for the droplet Infra API (Bucket 2.5). Same endpoints Claude Code
// curls for debugging:
//   GET  /infra/processes
//   GET  /infra/logs/:name?lines=100&since=1h
//   GET  /infra/logs/:name/error
//   GET  /infra/system
//   POST /infra/restart/:name
//
// Auth: bearer token over HTTPS. Base URL + token come from env. These calls are
// meant to run server-side (route handlers) so the token never reaches the browser.

const BASE = process.env.INFRA_API_URL; // e.g. https://your-infra-host.example.com
const TOKEN = process.env.INFRA_API_TOKEN;

function headers() {
  if (!BASE || !TOKEN) {
    throw new Error(
      "Infra API not configured - set INFRA_API_URL and INFRA_API_TOKEN",
    );
  }
  return { Authorization: `Bearer ${TOKEN}` };
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: headers(),
    next: { revalidate: 10 }, // process status - fresh enough, instant on nav
  });
  if (!res.ok) throw new Error(`Infra API ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export const infraApi = {
  // /infra/processes wraps the list in { processes: [...] }.
  processes: async () =>
    (await get<{ processes: ProcessStatus[] }>("/infra/processes")).processes,
  system: () => get<SystemStats>("/infra/system"),
  logs: (name: string, opts?: { lines?: number; since?: string }) => {
    const q = new URLSearchParams();
    if (opts?.lines) q.set("lines", String(opts.lines));
    if (opts?.since) q.set("since", opts.since);
    const qs = q.toString();
    return get<LogsResponse>(`/infra/logs/${name}${qs ? `?${qs}` : ""}`);
  },
  errorLogs: (name: string) => get<LogsResponse>(`/infra/logs/${name}/error`),
  // PnL time-series for the curve. Uses the read:pnl
  // scoped key (not the master token). Returns [] when empty / unconfigured so
  // callers degrade cleanly.
  pnlSeries: async (opts?: {
    days?: number;
    interval?: "5m" | "1h" | "1d";
    metric?: "equity" | "realized" | "unrealized" | "total_pnl";
  }): Promise<{ ts: number; value: number }[]> => {
    const READ_KEY = process.env.POLY_PNL_READ_KEY;
    if (!BASE || !READ_KEY) return [];
    try {
      const from = Math.floor(Date.now() / 1000) - (opts?.days ?? 365) * 86400;
      const q = new URLSearchParams({
        from: String(from),
        interval: opts?.interval ?? "1d",
        metric: opts?.metric ?? "equity",
      });
      const res = await fetch(`${BASE}/pnl/series?${q.toString()}`, {
        headers: { Authorization: `Bearer ${READ_KEY}` },
        next: { revalidate: 20 },
      });
      if (!res.ok) return [];
      const r = (await res.json()) as { series?: { ts: number; value: number }[] };
      return Array.isArray(r.series) ? r.series : [];
    } catch {
      return [];
    }
  },
  // Unified cross-source positions (read:positions key). Bare array.
  // Returns [] when empty / unconfigured.
  positions: async (opts?: { status?: "open" | "closed"; source?: string }): Promise<UnifiedPosition[]> => {
    const KEY = process.env.POLY_POSITIONS_READ_KEY;
    if (!BASE || !KEY) return [];
    try {
      const q = new URLSearchParams();
      if (opts?.status) q.set("status", opts.status);
      if (opts?.source) q.set("source", opts.source);
      const qs = q.toString();
      const res = await fetch(`${BASE}/positions${qs ? `?${qs}` : ""}`, {
        headers: { Authorization: `Bearer ${KEY}` },
        next: { revalidate: 20 },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? (data as UnifiedPosition[]) : [];
    } catch {
      return [];
    }
  },
  restart: async (name: string) => {
    const res = await fetch(`${BASE}/infra/restart/${name}`, {
      method: "POST",
      headers: headers(),
    });
    if (!res.ok) throw new Error(`Infra API restart/${name} → ${res.status}`);
    return res.json();
  },
};

export const isInfraConfigured = () => Boolean(BASE && TOKEN);
