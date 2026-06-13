"use client";

import { useMemo } from "react";
import { usd } from "@/lib/format";

// Equity / PnL curve - dependency-free inline SVG. Adaptive: plots whatever
// history exists (no dead fixed-window frame), labels the actual span, and with
// a single point shows the value + "tracking started" instead of an empty box.
export function PnlChart({ points }: { points: { ts: number; value: number }[] }) {
  const geom = useMemo(() => {
    if (points.length < 2) return null;
    const vals = points.map((p) => p.value);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const span = hi - lo || Math.max(1, Math.abs(hi));
    const pad = span * 0.12;
    const yLo = lo - pad;
    const ySpan = hi - yLo + pad || 1;
    const n = points.length;
    const coords = points.map((p, i) => {
      const x = (i / (n - 1)) * 100;
      const y = 100 - ((p.value - yLo) / ySpan) * 100;
      return [x, y] as const;
    });
    const line = coords.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
    const up = vals[n - 1] >= vals[0];
    const ms = points[n - 1].ts - points[0].ts;
    const win =
      ms >= 86_400_000 ? `${Math.round(ms / 86_400_000)}d` : ms >= 3_600_000 ? `${Math.round(ms / 3_600_000)}h` : `${Math.max(1, Math.round(ms / 60_000))}m`;
    return { line, area: `0,100 ${line} 100,100`, lo, hi, first: vals[0], last: vals[n - 1], up, win };
  }, [points]);

  if (!geom) {
    const last = points[points.length - 1];
    return (
      <div className="font-mono text-xs text-faint">
        {last ? (
          <>
            <span className="text-foreground text-sm">{usd(last.value)}</span> · tracking started -
            curve builds as you use it
          </>
        ) : (
          "No equity data yet."
        )}
      </div>
    );
  }

  // A near-flat line reads as broken. When movement is < 0.5% of NAV, show a
  // clean one-liner instead of a dead horizontal line.
  if (geom.hi - geom.lo < Math.max(0.01, geom.last * 0.005)) {
    return (
      <div className="font-mono text-xs text-faint">
        <span className="text-foreground text-sm">{usd(geom.last)}</span> · flat over {geom.win}
      </div>
    );
  }

  const stroke = geom.up ? "rgb(84,201,138)" : "rgb(226,103,79)";
  const fill = geom.up ? "rgba(84,201,138,0.10)" : "rgba(226,103,79,0.10)";
  const change = geom.last - geom.first;

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="font-mono text-lg text-foreground">{usd(geom.last)}</span>
        <span className={`font-mono text-xs ${geom.up ? "text-pos" : "text-neg"}`}>
          {change >= 0 ? "+" : ""}
          {usd(change)} · {geom.win}
        </span>
      </div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-28 w-full">
        <polygon points={geom.area} fill={fill} />
        <polyline points={geom.line} fill="none" stroke={stroke} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[11px] text-faint">
        <span>lo {usd(geom.lo)}</span>
        <span>hi {usd(geom.hi)}</span>
      </div>
    </div>
  );
}
