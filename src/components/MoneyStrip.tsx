"use client";

import { PnlChart } from "@/components/PnlChart";
import { usd } from "@/lib/format";

// Zone ②: the money, once. NAV + today's PnL + a cash/deployed bar + the equity
// sparkline - no figure repeated anywhere else on the page.
export function MoneyStrip({
  cash,
  deployed,
  pnl,
  count,
  connected,
  equity,
}: {
  cash: number;
  deployed: number;
  pnl: number;
  count: number;
  connected: boolean;
  equity: { ts: number; value: number }[];
}) {
  const total = cash + deployed;
  const cashPct = total > 0 ? (cash / total) * 100 : 0;
  const deployedPct = total > 0 ? (deployed / total) * 100 : 0;

  return (
    <div className="grid gap-x-12 gap-y-6 lg:grid-cols-[1.1fr_1fr]">
      <div className="flex flex-col justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-muted">Net asset value</div>
          <div className="mt-1 flex items-baseline gap-4">
            <span className="font-mono text-4xl tracking-tight text-foreground">{usd(total)}</span>
            <span className={`font-mono text-sm ${pnl > 0 ? "text-pos" : pnl < 0 ? "text-neg" : "text-faint"}`}>
              {pnl >= 0 ? "+" : ""}
              {usd(pnl)} today
            </span>
          </div>
        </div>

        {connected && total > 0 ? (
          <div className="mt-5">
            <div className="flex h-2 overflow-hidden rounded-full bg-elevated">
              <div style={{ width: `${cashPct}%`, background: "var(--accent)" }} />
              <div style={{ width: `${deployedPct}%`, background: "var(--pos)" }} />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent)" }} />
                Idle cash <span className="text-foreground">{usd(cash)}</span>
                <span className="text-faint">{Math.round(cashPct)}%</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--pos)" }} />
                Deployed <span className="text-foreground">{usd(deployed)}</span>
                <span className="text-faint">{count ? `${count} pos` : "-"}</span>
              </span>
            </div>
          </div>
        ) : (
          <div className="mt-5 text-xs text-faint">Connect a wallet to see your allocation.</div>
        )}
      </div>

      <div>
        <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-muted">Equity</div>
        <PnlChart points={equity} />
      </div>
    </div>
  );
}
