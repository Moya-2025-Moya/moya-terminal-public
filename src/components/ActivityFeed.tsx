"use client";

import { useActivity, type ActivityKind } from "@/lib/pm-activity";
import { nowMs } from "@/lib/polymarket-exec";

const ICON: Record<ActivityKind, string> = {
  order: "→",
  cancel: "×",
  reprice: "~",
  approve: "✓",
  fund: "↓",
  withdraw: "↑",
  close: "■",
  deploy: "+",
};

function ago(ts: number, now: number): string {
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function ActivityFeed({ limit = 12 }: { limit?: number }) {
  const items = useActivity();
  const now = nowMs();

  if (items.length === 0) {
    return <p className="text-xs text-faint">No operations yet - orders, approvals, transfers log here.</p>;
  }

  return (
    <ul className="divide-y divide-hairline">
      {items.slice(0, limit).map((a) => (
        <li key={a.id} className="flex items-center gap-3 py-2 font-mono text-xs">
          <span className={`w-3 shrink-0 text-center ${a.ok ? "text-muted" : "text-neg"}`}>{ICON[a.kind]}</span>
          <span className={`min-w-0 flex-1 truncate ${a.ok ? "text-foreground" : "text-neg"}`}>
            {a.text}
            {a.detail && <span className="ml-2 text-faint">{a.detail}</span>}
          </span>
          <span className="shrink-0 text-faint">{ago(a.ts, now)}</span>
        </li>
      ))}
    </ul>
  );
}
