"use client";

import { useState } from "react";
import type { CachedPosition } from "@/lib/types";
import { usd } from "@/lib/format";

const PAGE = 50;

// Positions are pre-sorted by value (desc) and dust-filtered server-side.
// Renders top `PAGE` with a "Show more" stepper so a wallet with many positions
// doesn't dump thousands of rows at once.
export function PositionsTable({
  positions,
  totalMeaningful,
  dustHidden,
}: {
  positions: CachedPosition[];
  totalMeaningful: number;
  dustHidden: number;
}) {
  const [visible, setVisible] = useState(PAGE);
  const shown = positions.slice(0, visible);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-[0.12em] text-faint">
              <th className="pb-2 font-normal">Asset</th>
              <th className="pb-2 font-normal">Chain</th>
              <th className="pb-2 font-normal">Protocol</th>
              <th className="pb-2 font-normal">Type</th>
              <th className="pb-2 text-right font-normal">Value</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {shown.map((p) => (
              <tr key={p.id} className="border-t border-hairline">
                <td className="py-2">{p.symbol ?? "-"}</td>
                <td className="py-2">{p.chain ?? "-"}</td>
                <td className="py-2">{p.protocol ?? "-"}</td>
                <td className="py-2">
                  {p.is_debt ? (
                    <span className="text-neg">{p.position_type}</span>
                  ) : (
                    p.position_type
                  )}
                </td>
                <td className="py-2 text-right">
                  {p.is_debt ? `(${usd(p.value_usd)})` : usd(p.value_usd)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-faint">
        <span>
          showing {shown.length} of {totalMeaningful}
          {dustHidden > 0 && ` · ${dustHidden} dust (< $1) hidden`}
          {totalMeaningful > positions.length &&
            ` · capped at top ${positions.length}`}
        </span>
        {visible < positions.length && (
          <button
            onClick={() => setVisible((v) => v + PAGE)}
            className="rounded-md border border-border px-3 py-1 text-muted hover:border-accent hover:text-foreground"
          >
            Show more
          </button>
        )}
      </div>
    </div>
  );
}
