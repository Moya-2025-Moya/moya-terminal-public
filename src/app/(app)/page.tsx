import { PageHeader } from "@/components/ui/PageHeader";
import { OverviewDashboard } from "@/components/OverviewDashboard";
import { defiApi, isDefiConfigured } from "@/lib/zerion";
import { infraApi, isInfraConfigured } from "@/lib/infra-api";

// Overview - open it and see total exposure at a glance. DeFi is wired (Zerion
// cache); bots and discretionary aren't connected yet, so they invite action
// rather than showing a dash.
export default async function OverviewPage() {
  let net: number | null = null;
  let assets: number | null = null;
  let debt: number | null = null;

  if (isDefiConfigured()) {
    try {
      const s = await defiApi.summary();
      net = s.net_usd;
      assets = s.assets_usd;
      debt = s.debt_usd;
    } catch {
      /* fetcher unreachable - leave null, shown as "Not connected" below */
    }
  }

  // PnL curve series (empty until the droplet /pnl endpoints + bots are live).
  const [pnlSeries, positions] = isInfraConfigured()
    ? await Promise.all([
        infraApi.pnlSeries({ days: 30, interval: "1d", metric: "equity" }),
        infraApi.positions({ status: "open" }),
      ])
    : [[], []];

  return (
    <div>
      <PageHeader title="Overview" />
      <OverviewDashboard defi={{ net, assets, debt }} pnlSeries={pnlSeries} positions={positions} />
    </div>
  );
}
