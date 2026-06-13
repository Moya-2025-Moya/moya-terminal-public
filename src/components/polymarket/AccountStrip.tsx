"use client";

import { usd } from "@/lib/format";
import type { AccountSummary } from "@/lib/useAccountSummary";

// Always-on account status: glance at cash, exposure, and PnL without leaving
// the market view. Sits above the three-column terminal.
export function AccountStrip({ summary }: { summary: AccountSummary }) {
  const { cash, value, pnl } = summary;
  return (
    <div className="flex items-center justify-between rounded-lg border border-hairline bg-surface px-4 py-2">
      <span className="font-display text-xs uppercase tracking-[0.2em] text-muted">
        Polymarket
      </span>
      <div className="flex items-center gap-7">
        <Stat label="Cash" value={cash == null ? "-" : usd(cash)} />
        <Stat label="Positions" value={usd(value)} />
        <Stat
          label="PnL"
          value={`${pnl >= 0 ? "+" : ""}${usd(pnl)}`}
          tone={pnl > 0 ? "pos" : pnl < 0 ? "neg" : undefined}
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "pos" | "neg";
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[10px] uppercase tracking-[0.14em] text-faint">{label}</span>
      <span
        className={`font-mono text-sm ${
          tone === "pos" ? "text-pos" : tone === "neg" ? "text-neg" : "text-foreground"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
