import { Card, Stat } from "@/components/ui/Card";
import { PageHeader, EmptyState } from "@/components/ui/PageHeader";
import { usd } from "@/lib/format";

// Bucket 3 - discretionary, read-only. CEX positions via read-only keys
// (Hyperliquid + Aster), on-chain holdings via Zerion. No execution here.
export default function DiscretionaryPage() {
  return (
    <div>
      <PageHeader title="Discretionary" />

      <div className="grid grid-cols-2 gap-x-10 gap-y-8 sm:grid-cols-3">
        <Stat label="CEX exposure" value={usd(0)} hint="Hyperliquid + Aster" />
        <Stat label="On-chain holdings" value={usd(0)} hint="via Zerion" />
        <Stat label="Net PnL" value={usd(0)} />
      </div>

      <div className="mt-14 grid grid-cols-1 gap-x-12 gap-y-10 lg:grid-cols-2">
        <Card title="CEX positions">
          <EmptyState
            title="No exchange connected."
            hint="Add a read-only API key (Hyperliquid or Aster) to pull live longs / shorts. Read-only - no execution from here."
          />
        </Card>
        <Card title="On-chain holdings">
          <EmptyState
            title="No on-chain holdings tracked."
            hint="These come from the same Zerion source as DeFi - add a wallet on the DeFi page and spot holdings show up here."
          />
        </Card>
      </div>
    </div>
  );
}
