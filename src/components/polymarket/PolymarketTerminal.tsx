"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import type { PmMarket, PmBook } from "@/lib/polymarket";
import type { MarketWithVol } from "./MarketSelector";
import { MarketSelector } from "./MarketSelector";
import { MarketView } from "./MarketView";
import { AccountOverview } from "./AccountOverview";
import { AccountStrip } from "./AccountStrip";
import { OrderPanel } from "./OrderPanel";
import { useAlarmChecker } from "@/lib/useAlarmChecker";
import { useAccountSummary } from "@/lib/useAccountSummary";

const POLL_MS = 5000;

type CenterTab = "market" | "account";

export function PolymarketTerminal({ markets }: { markets: MarketWithVol[] }) {
  const [selectedId, setSelectedId] = useState(markets[0]?.condition_id ?? "");
  const [tab, setTab] = useState<CenterTab>("market");
  const [books, setBooks] = useState<Record<string, PmBook | null>>({});
  const reqId = useRef(0);

  useAlarmChecker(); // global: poll midpoints, fire alerts while tab is open
  const summary = useAccountSummary(); // cash / positions / pnl + held markets

  // Select a market AND reflect it in the URL (?m=<cid>) so the view is
  // shareable and reachable by deep-link from anywhere in the app.
  const select = useCallback((id: string) => {
    setSelectedId(id);
    setTab("market");
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("m", id);
      u.searchParams.delete("token");
      window.history.replaceState(null, "", u);
    } catch {
      /* ignore */
    }
  }, []);

  // Resolve an inbound deep-link once markets are loaded: ?m=<conditionId> or
  // ?token=<tokenId> (positions link by token, which we map back to its market).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    const m = p.get("m");
    const token = p.get("token");
    let target: string | undefined;
    if (m && markets.some((x) => x.condition_id === m)) target = m;
    else if (token)
      target = markets.find((x) => x.tokens.some((t) => t.token_id === token))?.condition_id;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (target) setSelectedId(target);
  }, [markets]);

  const selected: MarketWithVol | undefined = markets.find(
    (m) => m.condition_id === selectedId,
  );
  // Which markets the terminal can actually open (the loaded set) - gates in-app
  // jumps from the smart-money drill-down.
  const loadable = useMemo(() => new Set(markets.map((m) => m.condition_id)), [markets]);

  const fetchBooks = useCallback(async (market: PmMarket, id: number) => {
    const entries = await Promise.all(
      market.tokens.map(async (t) => {
        try {
          const r = await fetch(`/api/pm/book?token_id=${t.token_id}`, {
            cache: "no-store",
          });
          return [t.token_id, r.ok ? ((await r.json()) as PmBook) : null] as const;
        } catch {
          return [t.token_id, null] as const;
        }
      }),
    );
    if (id === reqId.current) setBooks(Object.fromEntries(entries));
  }, []);

  useEffect(() => {
    if (!selected) return;
    const id = ++reqId.current;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBooks({});
    fetchBooks(selected, id);
    const t = setInterval(() => fetchBooks(selected, id), POLL_MS);
    return () => clearInterval(t);
  }, [selected, fetchBooks]);

  return (
    <div className="flex h-[calc(100vh-5rem)] flex-col gap-2">
      <AccountStrip summary={summary} />
      <div className="grid min-h-0 flex-1 grid-cols-[19rem_minmax(0,1fr)_22rem] gap-px overflow-hidden rounded-lg border border-hairline bg-hairline">
      <div className="overflow-y-auto bg-bg">
        <MarketSelector
          markets={markets}
          selectedId={selectedId}
          onSelect={select}
          held={summary.held}
        />
      </div>
      <div className="overflow-y-auto bg-bg px-8 py-6">
        <div className="mb-6 flex gap-1 text-xs">
          {(["market", "account"] as CenterTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1 uppercase tracking-wide ${
                tab === t ? "bg-elevated text-accent" : "text-muted hover:text-foreground"
              }`}
            >
              {t === "market" ? "Market" : "Account"}
            </button>
          ))}
        </div>
        {tab === "market" ? (
          <MarketView market={selected} books={books} onJump={select} loadable={loadable} />
        ) : (
          <AccountOverview />
        )}
      </div>
      <div className="overflow-y-auto bg-bg px-6 py-6">
        <OrderPanel key={selectedId} market={selected} books={books} />
      </div>
      </div>
    </div>
  );
}
