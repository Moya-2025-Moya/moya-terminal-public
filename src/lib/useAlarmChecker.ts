"use client";

import { useEffect } from "react";
import { useAlarms, markTriggered, type Alarm } from "./pm-alarms";

const POLL_MS = 15_000;

function notify(a: Alarm, price: number) {
  const dir = a.op === "gte" ? "≥" : "≤";
  const body = `${a.outcome} ${dir} ${a.threshold.toFixed(2)} (now ${price.toFixed(2)})\n${a.title}`;
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification("Polymarket alert", { body });
    }
  } catch {
    /* notifications unsupported - UI badge still shows it triggered */
  }
}

/** Mount once: polls midpoints for all active alarms and fires on cross. */
export function useAlarmChecker() {
  const alarms = useAlarms();

  useEffect(() => {
    const active = alarms.filter((a) => !a.triggered);
    if (active.length === 0) return;

    let alive = true;
    async function tick() {
      const tokens = [...new Set(active.map((a) => a.tokenId))];
      const entries = await Promise.all(
        tokens.map(async (t) => {
          try {
            const r = await fetch(`/api/pm/midpoint?token_id=${encodeURIComponent(t)}`, {
              cache: "no-store",
            });
            if (!r.ok) return [t, null] as const;
            const d = (await r.json()) as { mid?: string | number };
            const v = Number(d.mid);
            return [t, Number.isFinite(v) ? v : null] as const;
          } catch {
            return [t, null] as const;
          }
        }),
      );
      if (!alive) return;
      const mids = Object.fromEntries(entries);
      for (const a of active) {
        const p = mids[a.tokenId];
        if (p == null) continue;
        const hit = a.op === "gte" ? p >= a.threshold : p <= a.threshold;
        if (hit) {
          notify(a, p);
          markTriggered(a.id);
        }
      }
    }

    tick();
    const iv = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [alarms]);
}
