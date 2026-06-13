import { Card, Stat } from "@/components/ui/Card";
import { PageHeader, Pending } from "@/components/ui/PageHeader";
import { StatusDot, toneFor } from "@/components/ui/StatusDot";
import { infraApi, isInfraConfigured } from "@/lib/infra-api";
import type { ProcessStatus, SystemStats } from "@/lib/types";

function formatUptime(ms: number) {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

export default async function InfraPage() {
  let processes: ProcessStatus[] = [];
  let system: SystemStats | null = null;
  let error: string | null = null;

  if (isInfraConfigured()) {
    try {
      [processes, system] = await Promise.all([
        infraApi.processes(),
        infraApi.system(),
      ]);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  return (
    <div>
      <PageHeader title="Infra" />

      {!isInfraConfigured() ? (
        <Pending note="Set INFRA_API_URL and INFRA_API_TOKEN to read the droplet (:3001)." />
      ) : error ? (
        <div className="text-sm text-neg">
          Couldn&apos;t reach the Infra API - {error}
        </div>
      ) : (
        <>
          {system && (
            <div className="grid grid-cols-2 gap-x-10 gap-y-8 sm:grid-cols-4">
              <Stat label="CPU" value={`${system.cpu_percent.toFixed(0)}%`} accent size="lg" />
              <Stat
                label="Memory"
                value={`${(system.memory.used_mb / 1024).toFixed(1)} / ${(system.memory.total_mb / 1024).toFixed(1)} GB`}
                hint={`${system.memory.percent}% used`}
              />
              <Stat
                label="Disk"
                value={`${system.disk.used_gb.toFixed(1)} / ${system.disk.total_gb.toFixed(0)} GB`}
                hint={`${system.disk.percent}% used`}
              />
              <Stat label="Uptime" value={`${system.uptime_hours.toFixed(1)}h`} />
            </div>
          )}

          <div className="mt-14">
            <Card title="PM2 processes">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-[0.12em] text-faint">
                    <th className="pb-3 font-normal">Process</th>
                    <th className="pb-3 font-normal">Status</th>
                    <th className="pb-3 font-normal">Uptime</th>
                    <th className="pb-3 text-right font-normal">CPU</th>
                    <th className="pb-3 text-right font-normal">Mem</th>
                    <th className="pb-3 text-right font-normal">Restarts</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {processes.map((p) => (
                    <tr key={p.pm_id} className="border-t border-hairline">
                      <td className="py-2.5 text-foreground">{p.name}</td>
                      <td className="py-2.5">
                        <StatusDot tone={toneFor(p.status)} label={p.status} />
                      </td>
                      <td className="py-2.5 text-muted">{formatUptime(p.uptime_ms)}</td>
                      <td className="py-2.5 text-right text-muted">{p.cpu}%</td>
                      <td className="py-2.5 text-right text-muted">{p.memory_mb.toFixed(0)}MB</td>
                      <td className="py-2.5 text-right text-muted">{p.restart_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
