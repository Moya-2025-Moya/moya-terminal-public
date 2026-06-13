"use client";

import { useAlertConfig, setAlertConfig } from "@/lib/pm-alert-config";

// Portfolio risk thresholds you set yourself. Breaches light up the top status
// bar red. Per-market price alarms live on each market (Alerts); this is the
// account-level layer.
export function AlertSettings() {
  const cfg = useAlertConfig();

  const parse = (v: string): number | null => {
    const t = v.trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };

  return (
    <div className="space-y-3">
      <Row
        label="Alert when PnL below"
        prefix="$"
        value={cfg.pnlFloor}
        placeholder="e.g. -50"
        onChange={(v) => setAlertConfig({ pnlFloor: parse(v) })}
      />
      <Row
        label="Alert when equity below"
        prefix="$"
        value={cfg.navFloor}
        placeholder="e.g. 400"
        onChange={(v) => setAlertConfig({ navFloor: parse(v) })}
      />
      <p className="text-[11px] text-faint">
        Blank = off. Breaches turn the top status bar red. Per-market price alerts are set on each
        market.
      </p>
    </div>
  );
}

function Row({
  label,
  prefix,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  prefix: string;
  value: number | null;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted">{label}</span>
      <span className="flex items-center gap-1">
        <span className="font-mono text-xs text-faint">{prefix}</span>
        <input
          defaultValue={value == null ? "" : String(value)}
          onChange={(e) => onChange(e.target.value)}
          inputMode="decimal"
          placeholder={placeholder}
          className="w-24 rounded-md border border-border bg-elevated px-2 py-1 font-mono text-xs text-foreground placeholder:text-faint focus:border-accent focus:outline-none"
        />
      </span>
    </div>
  );
}
