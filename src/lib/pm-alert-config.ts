"use client";

import { useSyncExternalStore } from "react";

// User-defined portfolio risk thresholds (separate from per-market price alarms).
// Drive the always-on status bar: breach → red. Stored locally, single user.

export interface AlertConfig {
  pnlFloor: number | null; // alert when unrealized PnL drops below this (USD, e.g. -50)
  navFloor: number | null; // alert when account equity drops below this (USD)
}

const KEY = "pm_alert_config";
const DEFAULT: AlertConfig = { pnlFloor: null, navFloor: null };

let config: AlertConfig = load();
const listeners = new Set<() => void>();

function load(): AlertConfig {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object") return { ...DEFAULT, ...parsed };
    return { ...DEFAULT };
  } catch {
    return { ...DEFAULT };
  }
}

function emit() {
  for (const l of listeners) l();
}

export function setAlertConfig(patch: Partial<AlertConfig>): void {
  config = { ...config, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(config));
  } catch {
    /* ignore */
  }
  emit();
}

export function getAlertConfig(): AlertConfig {
  return config;
}

export function useAlertConfig(): AlertConfig {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getAlertConfig,
    () => DEFAULT,
  );
}

/** Which thresholds are currently breached, given live values. */
export function breaches(cfg: AlertConfig, pnl: number, equity: number): string[] {
  const out: string[] = [];
  if (cfg.pnlFloor != null && pnl < cfg.pnlFloor) out.push(`PnL < $${cfg.pnlFloor}`);
  if (cfg.navFloor != null && equity < cfg.navFloor) out.push(`equity < $${cfg.navFloor}`);
  return out;
}
