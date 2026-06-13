"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAttention } from "@/lib/useAttention";

const NAV: { href: string; label: string; go?: string; sub?: { href: string; label: string }[] }[] = [
  { href: "/", label: "Overview" },
  {
    href: "/polymarket",
    go: "/polymarket/overview", // section prefix for highlighting; click lands on the digest
    label: "Polymarket",
    sub: [
      { href: "/polymarket/overview", label: "Overview" },
      { href: "/polymarket", label: "Terminal" },
      { href: "/polymarket/insider", label: "Insider scan" },
      { href: "/polymarket/traders", label: "Traders" },
      { href: "/polymarket/underdog", label: "Underdog" },
    ],
  },
  { href: "/defi", label: "DeFi" },
  { href: "/bots", label: "Bots" },
  { href: "/infra", label: "Infra" },
  { href: "/discretionary", label: "Discretionary" },
];

export function Sidebar() {
  const pathname = usePathname();
  const a = useAttention();

  // Live vital-signs dot per bucket. Polymarket + Overview reflect the real
  // attention state; the unwired buckets sit idle until they have a data source.
  function dotClass(href: string): string {
    const live = href === "/polymarket" || href === "/";
    if (!live || !a.connected) return "bg-faint/40";
    if (a.tone === "bad") return "bg-neg animate-pulse";
    if (a.tone === "warn") return "bg-warn";
    return "bg-pos";
  }

  return (
    <nav className="flex w-52 shrink-0 flex-col gap-0.5 border-r border-hairline px-4 py-6">
      <div className="px-2 pb-8">
        <div className="font-display text-base tracking-tight text-foreground">
          moya<span className="text-accent">.</span>terminal
        </div>
      </div>
      {NAV.map((item) => {
        const sectionActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        const showSub = item.sub && sectionActive;
        return (
          <div key={item.href}>
            <Link
              href={item.go ?? item.href}
              className={`group relative flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors ${
                sectionActive ? "bg-elevated text-foreground" : "text-muted hover:bg-elevated/50 hover:text-foreground"
              }`}
            >
              {sectionActive && (
                <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-accent" />
              )}
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass(item.href)}`} />
              {item.label}
            </Link>
            {showSub && (
              <div className="mt-0.5 flex flex-col gap-0.5 pb-1 pl-[1.45rem]">
                {item.sub!.map((s) => {
                  const subActive = pathname === s.href;
                  return (
                    <Link
                      key={s.href}
                      href={s.href}
                      className={`rounded px-2 py-1 text-[13px] transition-colors ${
                        subActive ? "text-accent" : "text-muted hover:text-foreground"
                      }`}
                    >
                      {s.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      <div className="mt-auto px-2 pt-8">
        <div className="font-mono text-[10px] text-faint">⌘K to jump</div>
      </div>
    </nav>
  );
}
