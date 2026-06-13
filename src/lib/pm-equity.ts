"use client";

import { useSyncExternalStore } from "react";

// Local NAV history - a smart day-one equity curve with no backend. Every time
// the Overview computes total NAV we append a snapshot (throttled), so a real
// curve forms as you use the terminal. When the droplet /pnl series exists it
// takes over; until then this gives an honest, growing line instead of a dead
// "30d" frame. Window is adaptive (plots from the first snapshot, not a fixed 30d).

export type EquityPoint = { ts: number; value: number };

const KEY = "pm_equity_history";
const MIN_GAP_MS = 20 * 60 * 1000; // collapse snapshots within 20 min
const MAX_POINTS = 800;
const EMPTY: EquityPoint[] = [];

let points: EquityPoint[] = load();
const listeners = new Set<() => void>();

function load(): EquityPoint[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(points));
  } catch {
    /* ignore */
  }
}

function emit() {
  for (const l of listeners) l();
}

/** Record the current total NAV. Collapses rapid repeats into the latest point. */
export function recordNav(value: number, now: number): void {
  if (!(value > 0)) return; // skip zero / mid-load
  const last = points[points.length - 1];
  if (last && now - last.ts < MIN_GAP_MS) {
    points = [...points.slice(0, -1), { ts: now, value }];
  } else {
    points = [...points, { ts: now, value }].slice(-MAX_POINTS);
  }
  persist();
  emit();
}

export function getEquity(): EquityPoint[] {
  return points;
}

export function useEquityHistory(): EquityPoint[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getEquity,
    () => EMPTY,
  );
}
