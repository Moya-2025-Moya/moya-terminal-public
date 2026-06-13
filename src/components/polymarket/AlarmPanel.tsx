"use client";

import { useState } from "react";
import type { PmMarket } from "@/lib/polymarket";
import { useAlarms, addAlarm, removeAlarm, type AlarmOp } from "@/lib/pm-alarms";

// Per-market alert control (the ). Set "notify when <outcome> ≥/≤ <prob>".
// Alerts for the open market are listed here; the global checker fires them.
export function AlarmPanel({ market }: { market: PmMarket }) {
  const all = useAlarms();
  const mine = all.filter((a) => a.conditionId === market.condition_id);

  const [tokenId, setTokenId] = useState(market.tokens[0]?.token_id ?? "");
  const [op, setOp] = useState<AlarmOp>("gte");
  const [threshold, setThreshold] = useState("0.70");

  const valid = (() => {
    const v = Number(threshold);
    return !!market.tokens.find((x) => x.token_id === tokenId) && v > 0 && v < 1;
  })();

  function add() {
    const t = market.tokens.find((x) => x.token_id === tokenId);
    const v = Number(threshold);
    if (!t || !(v > 0 && v < 1)) return;
    addAlarm({
      conditionId: market.condition_id,
      title: market.question,
      tokenId: t.token_id,
      outcome: t.outcome,
      op,
      threshold: v,
    });
    // Ask for notification permission the first time the user sets one.
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        Notification.requestPermission();
      }
    } catch {
      /* unsupported */
    }
  }

  const fieldCls = "rounded border border-border bg-bg px-2 py-1 text-foreground focus:border-accent focus:outline-none";

  return (
    <div>
      <div className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-muted">Alerts</div>

      {/* Always-on, reads like a sentence: Notify when [Yes] [≥] [0.70] */}
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-border bg-elevated p-2 text-sm">
        <span className="text-muted">Notify when</span>
        <select value={tokenId} onChange={(e) => setTokenId(e.target.value)} className={fieldCls}>
          {market.tokens.map((t) => (
            <option key={t.token_id} value={t.token_id}>
              {t.outcome}
            </option>
          ))}
        </select>
        <select value={op} onChange={(e) => setOp(e.target.value as AlarmOp)} className={`${fieldCls} font-mono`}>
          <option value="gte">≥</option>
          <option value="lte">≤</option>
        </select>
        <input
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && valid && add()}
          inputMode="decimal"
          title="probability 0-1"
          className={`${fieldCls} w-16 font-mono`}
        />
        <button
          onClick={add}
          disabled={!valid}
          className="rounded bg-accent px-2.5 py-1 text-xs font-medium text-[var(--bg)] hover:opacity-90 disabled:opacity-40"
        >
          Add
        </button>
      </div>

      {mine.length === 0 ? (
        <p className="text-xs text-faint">No alerts set. Threshold is a probability (0-1).</p>
      ) : (
        <ul className="divide-y divide-hairline">
          {mine.map((a) => (
            <li key={a.id} className="flex items-center justify-between py-1.5 font-mono text-xs">
              <span className={a.triggered ? "text-warn" : "text-foreground"}>
                {a.outcome} {a.op === "gte" ? "≥" : "≤"} {a.threshold.toFixed(2)}
                {a.triggered && <span className="ml-2 text-warn">triggered</span>}
              </span>
              <button onClick={() => removeAlarm(a.id)} className="text-faint hover:text-neg">
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
