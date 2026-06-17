"use client";

import { useEffect } from "react";
import { Card } from "@/components/ui/Card";
import { ActivityFeed } from "@/components/ActivityFeed";
import { UnifiedPositions } from "@/components/UnifiedPositions";
import { AttentionHero } from "@/components/AttentionHero";
import { MoneyStrip } from "@/components/MoneyStrip";
import type { UnifiedPosition } from "@/lib/infra-api";
import { useAttention } from "@/lib/useAttention";
import { recordNav, useEquityHistory } from "@/lib/pm-equity";

type Defi = { net: number | null; assets: number | null; debt: number | null };
type Point = { ts: number; value: number };

// Three zones, hierarchy not a pile of equal cards:
//   ① Attention - the one thing that needs you (tone-reactive)
//   ② Money - NAV / allocation / equity, said exactly once
//   ③ Positions + activity - what you hold and what you did
export function OverviewDashboard({
  defi,
  pnlSeries = [],
  positions = [],
}: {
  defi: Defi;
  pnlSeries?: Point[];
  positions?: UnifiedPosition[];
}) {
  const a = useAttention();
  const defiNet = defi.net ?? 0;
  const deployed = a.positions + defiNet;
  const totalNav = a.cash + deployed;

  // Local NAV snapshot (instant curve). The `polymarket` PnL source is owned by
  // the API-Infra reporter now — the client must NOT push it (it only had a
  // partial view and fought other writers, causing flip-flopping numbers).
  const localHistory = useEquityHistory();
  useEffect(() => {
    if (totalNav > 0) recordNav(totalNav, Date.now());
  }, [totalNav]);
  const equity = pnlSeries.length >= 2 ? pnlSeries : localHistory;

  return (
    <div className="space-y-10">
      <AttentionHero a={a} />

      <MoneyStrip
        cash={a.cash}
        deployed={deployed}
        pnl={a.pnl}
        count={a.count}
        connected={a.connected}
        equity={equity}
      />

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.6fr_1fr]">
        <Card title={`Open positions${positions.length ? ` · ${positions.length}` : ""}`}>
          <UnifiedPositions positions={positions} />
        </Card>
        <Card title="Recent activity">
          <ActivityFeed limit={10} />
        </Card>
      </div>
    </div>
  );
}
