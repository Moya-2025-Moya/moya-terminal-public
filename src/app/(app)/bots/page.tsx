import { Card } from "@/components/ui/Card";
import { PageHeader, EmptyState } from "@/components/ui/PageHeader";
import { PnlIntegration } from "@/components/PnlIntegration";

// Bucket 2 - bot remote control. Each bot exposes status / log / PnL / pause-
// resume; the terminal is the remote, not the brain.
export default function BotsPage() {
  const ingestUrl = process.env.INFRA_API_URL ?? "http://YOUR_INFRA_HOST:3001";
  return (
    <div>
      <PageHeader title="Bots" />

      <div className="mb-8">
        <div className="mb-3 text-sm font-medium uppercase tracking-[0.12em] text-muted">PnL integration</div>
        <PnlIntegration
          ingestUrl={ingestUrl}
          keyId={process.env.POLY_PNL_WRITE_KEY_ID ?? ""}
          writeSecret={process.env.POLY_PNL_WRITE_SECRET ?? ""}
          readKey={process.env.POLY_PNL_READ_KEY ?? ""}
          positionsReadKey={process.env.POLY_POSITIONS_READ_KEY ?? ""}
        />
      </div>

      <Card title="Bots">
        <EmptyState
          title="No bots connected."
          hint="Point a bot’s status endpoint here (STORM, LP farmer, …) to see its state, recent log, PnL, and pause / resume - without leaving the terminal."
        />
      </Card>
    </div>
  );
}
