"use client";

import { useState } from "react";
import Link from "next/link";
import type { Attention } from "@/lib/useAttention";
import { AlertSettings } from "@/components/AlertSettings";
import { usd } from "@/lib/format";

// Zone ①: loud when something needs you, a quiet single line when calm. A cockpit
// shouldn't spend its prime real estate shouting "nothing's wrong".
export function AttentionHero({ a }: { a: Attention }) {
  const [settings, setSettings] = useState(false);
  const calm = a.tone === "ok";

  if (calm && !settings) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-hairline bg-surface px-4 py-2.5">
        <span className="flex items-center gap-2 text-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-pos" />
          <span className="text-muted">
            {a.connected ? "All clear - nothing needs you" : "Connect your wallet to monitor"}
          </span>
        </span>
        <span className="flex items-center gap-4 font-mono text-xs">
          {a.connected && (
            <span className={a.pnl > 0 ? "text-pos" : a.pnl < 0 ? "text-neg" : "text-faint"}>
              {a.pnl >= 0 ? "+" : ""}
              {usd(a.pnl)} today
            </span>
          )}
          <button
            onClick={() => setSettings(true)}
            className="text-[10px] uppercase tracking-[0.12em] text-faint hover:text-foreground"
          >
            Thresholds
          </button>
        </span>
      </div>
    );
  }

  const ring =
    a.tone === "bad"
      ? "border-neg/40 bg-neg/[0.06]"
      : a.tone === "warn"
        ? "border-warn/40 bg-warn/[0.06]"
        : "border-hairline bg-surface";
  const dot = a.tone === "bad" ? "bg-neg" : a.tone === "warn" ? "bg-warn" : "bg-pos";
  const headTone = a.tone === "bad" ? "text-neg" : a.tone === "warn" ? "text-warn" : "text-foreground";

  return (
    <div className={`rounded-xl border ${ring} px-5 py-4 transition-colors`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${dot} ${a.tone !== "ok" ? "animate-pulse" : ""}`} />
          <div className="min-w-0">
            <div className={`font-display text-lg leading-tight tracking-tight ${headTone}`}>
              {calm ? "All clear" : a.headline}
            </div>
            <div className="mt-0.5 text-xs text-muted">
              {a.items.length > 0
                ? `${a.items.length} thing${a.items.length > 1 ? "s" : ""} need${a.items.length > 1 ? "" : "s"} you`
                : "alert thresholds"}
            </div>
          </div>
        </div>
        <button
          onClick={() => setSettings((s) => !s)}
          className={`shrink-0 text-[10px] uppercase tracking-[0.12em] ${settings ? "text-accent" : "text-faint hover:text-foreground"}`}
        >
          Thresholds
        </button>
      </div>

      {a.items.length > 0 && (
        <ul className="mt-3 space-y-1">
          {a.items.map((it, i) => (
            <li key={i}>
              <Link
                href={it.href ?? "/"}
                className={`group flex items-center gap-2 rounded px-2 py-1 font-mono text-xs hover:bg-elevated ${
                  it.severity === "bad" ? "text-neg" : "text-warn"
                }`}
              >
                <span className="shrink-0">•</span>
                <span className="min-w-0 flex-1 truncate">{it.text}</span>
                <span className="shrink-0 text-faint group-hover:text-foreground">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {settings && (
        <div className="mt-4 border-t border-hairline pt-4">
          <AlertSettings />
        </div>
      )}
    </div>
  );
}
