import Link from "next/link";
import type { UnifiedPosition } from "@/lib/infra-api";
import { usd } from "@/lib/format";

// A Polymarket position id is `pm:<tokenId>` - deep-link into the terminal at
// that market (the terminal maps the token back to its market).
function terminalHref(p: UnifiedPosition): string | null {
  if (p.source !== "pm") return null;
  const token = p.id.replace(/^pm:/, "");
  return token ? `/polymarket?token=${encodeURIComponent(token)}` : null;
}

const SOURCE_LABEL: Record<string, string> = { pm: "Polymarket", defi: "DeFi", bot: "Bot" };

function exposure(p: UnifiedPosition): number {
  return Math.abs((p.unrealized ?? 0) + (p.size ?? 0) * (p.entry ?? 0));
}

// Cross-source open positions from the backend store - the "total exposure"
// view. pm + defi + bot, one source of truth.
export function UnifiedPositions({ positions }: { positions: UnifiedPosition[] }) {
  if (positions.length === 0) {
    return (
      <p className="text-xs text-faint">
        No tracked positions. Add a wallet on DeFi → it drives both DeFi and Polymarket; bots post their own.
      </p>
    );
  }

  const sorted = [...positions].sort((a, b) => exposure(b) - exposure(a));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-[0.12em] text-faint">
            <th className="pb-3 font-normal">Src</th>
            <th className="pb-3 font-normal">Market / symbol</th>
            <th className="pb-3 text-right font-normal">Size</th>
            <th className="pb-3 text-right font-normal">Entry</th>
            <th className="pb-3 text-right font-normal">Unreal.</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr key={p.id} className="border-t border-hairline align-top">
              <td className="py-2 pr-3">
                <span className="rounded bg-elevated px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted">
                  {SOURCE_LABEL[p.source] ?? p.source}
                </span>
              </td>
              <td className="py-2 pr-4 text-foreground">
                <span className="line-clamp-1">
                  {(() => {
                    const href = terminalHref(p);
                    return href ? (
                      <Link href={href} className="hover:text-accent hover:underline">
                        {p.market}
                      </Link>
                    ) : (
                      p.market
                    );
                  })()}
                  {p.url && (
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className="ml-1 text-faint hover:text-accent" title="Open on Polymarket">
                      ↗
                    </a>
                  )}
                </span>
                <span className="font-mono text-xs text-muted">
                  {p.symbol}
                  {p.side ? ` · ${p.side}` : ""}
                  {p.strategy ? ` · ${p.strategy}` : ""}
                </span>
              </td>
              <td className="py-2 text-right font-mono text-muted">{p.size != null ? p.size : "-"}</td>
              <td className="py-2 text-right font-mono text-muted">{p.entry != null ? p.entry : "-"}</td>
              <td className={`py-2 text-right font-mono ${(p.unrealized ?? 0) >= 0 ? "text-pos" : "text-neg"}`}>
                {p.unrealized != null ? `${p.unrealized >= 0 ? "+" : ""}${usd(p.unrealized)}` : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
