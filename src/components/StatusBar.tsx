"use client";

import Link from "next/link";
import { useAttention } from "@/lib/useAttention";
import { usd } from "@/lib/format";

// Header red-light: glance-level only. Depth lives in the Overview attention
// zone - both read useAttention, so they never disagree.
export function StatusBar() {
  const a = useAttention();

  if (!a.connected) {
    return (
      <span className="flex items-center gap-2 font-mono text-xs text-faint">
        <span className="h-1.5 w-1.5 rounded-full bg-faint" />
        wallet not connected
      </span>
    );
  }

  const dot = a.tone === "bad" ? "bg-neg" : a.tone === "warn" ? "bg-warn" : "bg-pos";
  const txt = a.tone === "bad" ? "text-neg" : a.tone === "warn" ? "text-warn" : "text-muted";

  return (
    <Link href="/" className="flex min-w-0 items-center gap-5 font-mono text-xs">
      <span className="flex min-w-0 items-center gap-2">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot} ${a.tone === "bad" ? "animate-pulse" : ""}`} />
        <span className={`truncate ${txt}`}>{a.headline}</span>
        {a.items.length > 1 && <span className="shrink-0 text-faint">+{a.items.length - 1}</span>}
      </span>
      <span className="hidden items-baseline gap-1.5 sm:flex">
        <span className="text-[10px] uppercase tracking-[0.12em] text-faint">PnL</span>
        <span className={a.pnl > 0 ? "text-pos" : a.pnl < 0 ? "text-neg" : "text-foreground"}>
          {a.pnl >= 0 ? "+" : ""}
          {usd(a.pnl)}
        </span>
      </span>
      <span className="hidden items-baseline gap-1.5 md:flex">
        <span className="text-[10px] uppercase tracking-[0.12em] text-faint">NAV</span>
        <span className="text-foreground">{usd(a.equity)}</span>
      </span>
    </Link>
  );
}
