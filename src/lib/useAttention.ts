"use client";

import { useAccountSummary } from "@/lib/useAccountSummary";
import { useAlarms } from "@/lib/pm-alarms";
import { useAlertConfig, breaches } from "@/lib/pm-alert-config";

export type Tone = "ok" | "warn" | "bad";
export interface AttentionItem {
  text: string;
  severity: "bad" | "warn";
  href?: string;
}

export interface Attention {
  tone: Tone;
  headline: string;
  items: AttentionItem[];
  connected: boolean;
  // shared money figures so surfaces don't re-derive them
  cash: number;
  positions: number;
  equity: number;
  pnl: number;
  count: number;
}

// Single source of truth for "is something wrong?" - fed by fired price alarms,
// breached portfolio thresholds, and drawdown. Both the header status bar and
// the Overview attention zone read this so they never disagree.
export function useAttention(): Attention {
  const pm = useAccountSummary();
  const alarms = useAlarms();
  const cfg = useAlertConfig();

  const connected = pm.cash != null;
  const cash = pm.cash ?? 0;
  const positions = pm.value;
  const equity = cash + positions;

  const items: AttentionItem[] = [];

  for (const a of alarms) {
    if (a.triggered) {
      items.push({
        text: `${a.outcome} ${a.op === "gte" ? "≥" : "≤"} ${a.threshold.toFixed(2)} hit · ${a.title.slice(0, 40)}`,
        severity: "bad",
        href: `/polymarket?m=${a.conditionId}`,
      });
    }
  }
  if (connected) {
    for (const b of breaches(cfg, pm.pnl, equity)) {
      items.push({ text: b.replace("<", "below"), severity: "bad", href: "/" });
    }
  }

  // Only escalate on conditions YOU defined (fired alarms / breached thresholds).
  // A position fluctuating slightly negative is normal - never a scary headline.
  const pnl = Math.abs(pm.pnl) < 0.005 ? 0 : pm.pnl;
  const tone: Tone = items.length > 0 ? "bad" : "ok";
  const headline = items.length > 0 ? items[0].text : !connected ? "wallet not connected" : "all clear";

  return { tone, headline, items, connected, cash, positions, equity, pnl, count: pm.held.size };
}
