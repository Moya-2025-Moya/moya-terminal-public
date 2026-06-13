"use client";

// Push the live Polymarket NAV to the PnL store (via the server route that holds
// the write key). Throttled to ~1 snapshot / 15 min via localStorage so we don't
// spam the series; each post lands a distinct ts, so read-time downsampling keeps
// the latest per bucket. Best-effort: failures are swallowed.

const MIN_GAP_MS = 15 * 60 * 1000;
const KEY = "pm_pnl_last_post";

export function reportPolymarketNav(snap: {
  equity: number;
  unrealized_pnl: number;
  cash: number;
}): void {
  if (!(snap.equity > 0)) return;
  let last = 0;
  try {
    last = Number(localStorage.getItem(KEY)) || 0;
  } catch {
    /* ignore */
  }
  const now = Date.now();
  if (now - last < MIN_GAP_MS) return;
  try {
    localStorage.setItem(KEY, String(now));
  } catch {
    /* ignore */
  }
  fetch("/api/pnl-ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: "polymarket",
      strategy: "polymarket",
      equity: snap.equity,
      realized_pnl: 0,
      unrealized_pnl: snap.unrealized_pnl,
      cash: snap.cash,
    }),
  }).catch(() => {});
}
