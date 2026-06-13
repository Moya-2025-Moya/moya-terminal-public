import { Card, Stat } from "@/components/ui/Card";
import { PageHeader, EmptyState, Pending } from "@/components/ui/PageHeader";
import { StatusDot, toneFor } from "@/components/ui/StatusDot";
import { AddWalletForm } from "@/components/AddWalletForm";
import { PositionsTable } from "@/components/PositionsTable";
import { defiApi, isDefiConfigured } from "@/lib/zerion";
import { usd, short } from "@/lib/format";
import type {
  CachedPosition,
  DefiSummary,
  DefiWalletStatus,
} from "@/lib/types";

const DUST_USD = 1;
const MAX_ROWS = 200;

export default async function DefiPage() {
  let summary: DefiSummary | null = null;
  let positions: CachedPosition[] = [];
  let wallets: DefiWalletStatus[] = [];
  let error: string | null = null;

  if (isDefiConfigured()) {
    try {
      const [s, p, w] = await Promise.all([
        defiApi.summary(),
        defiApi.positions(),
        defiApi.wallets(),
      ]);
      summary = s;
      positions = p.positions;
      wallets = w.wallets;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  const slugSuggestions = Array.from(
    new Set(wallets.map((w) => w.strategy_slug).filter((s): s is string => !!s)),
  );
  const meaningful = positions.filter(
    (p) => p.value_usd != null && Math.abs(p.value_usd) >= DUST_USD,
  );
  const dustHidden = positions.length - meaningful.length;
  const tablePositions = meaningful.slice(0, MAX_ROWS);

  return (
    <div>
      <PageHeader title="DeFi" />

      {!isDefiConfigured() ? (
        <Pending note="Set DEFI_API_URL and INFRA_API_TOKEN to read the droplet cache (:3002)." />
      ) : error ? (
        <div className="text-sm text-neg">
          Couldn&apos;t reach the fetcher (:3002) - {error}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-x-10 gap-y-8 sm:grid-cols-4">
            <Stat label="Net NAV" value={usd(summary?.net_usd)} hint="assets − debt" accent size="lg" />
            <Stat label="Assets" value={usd(summary?.assets_usd)} />
            <Stat label="Debt" value={usd(summary?.debt_usd)} deltaTone="neg" />
            <Stat label="Positions" value={meaningful.length || 0} hint="≥ $1" />
          </div>

          <div className="mt-14 grid grid-cols-1 gap-x-12 gap-y-12 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Card title="Positions">
                {meaningful.length === 0 ? (
                  <EmptyState
                    title="No positions yet."
                    hint="Add a wallet and they’ll appear after the next fetch (every 5 min)."
                  />
                ) : (
                  <PositionsTable
                    positions={tablePositions}
                    totalMeaningful={meaningful.length}
                    dustHidden={dustHidden}
                  />
                )}
              </Card>
            </div>

            <Card title="Wallets">
              {wallets.length > 0 && (
                <ul className="mb-6 divide-y divide-hairline">
                  {wallets.map((w) => (
                    <li key={w.address} className="flex items-center justify-between py-3">
                      <div className="min-w-0">
                        <div className="font-mono text-sm text-foreground">
                          {short(w.address)}
                          {w.label && <span className="ml-2 text-muted">{w.label}</span>}
                        </div>
                        {w.strategy_slug && (
                          <div className="text-xs text-faint">{w.strategy_slug}</div>
                        )}
                      </div>
                      <div className="text-right">
                        {w.last_fetch ? (
                          <>
                            <StatusDot tone={toneFor(w.last_fetch.status)} label={w.last_fetch.status} />
                            <div className="text-xs text-faint">
                              {w.last_fetch.position_count ?? 0} positions
                            </div>
                          </>
                        ) : (
                          <StatusDot tone="idle" label="awaiting first fetch" />
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {wallets.length === 0 && (
                <p className="mb-5 text-sm text-muted">
                  Add your first wallet to start tracking positions.
                </p>
              )}
              <AddWalletForm slugSuggestions={slugSuggestions} />
            </Card>
          </div>

          <div className="mt-14 grid grid-cols-1 gap-x-12 gap-y-10 lg:grid-cols-2">
            <Card title="Exit sequences">
              <EmptyState
                title="No exit sequences defined."
                hint="Each strategy gets a predefined unwind path (repay + withdraw, sell / redeem, remove liquidity) signed in your wallet. Define them at entry - not in a panic."
              />
            </Card>
            <Card title="Health factor / APY">
              <Pending note="Phase 2 - Zerion doesn’t return HF/APY. Health factor will come from Aave RPC (Alchemy); APY and Pendle maturity from protocol APIs." />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
