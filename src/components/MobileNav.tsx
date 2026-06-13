"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { StatusBar } from "@/components/StatusBar";
import { WalletButton } from "@/components/WalletButton";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/defi", label: "DeFi" },
  { href: "/bots", label: "Bots" },
  { href: "/polymarket", label: "Polymarket" },
  { href: "/infra", label: "Infra" },
  { href: "/discretionary", label: "Discretionary" },
];

// Mobile-only top bar + slide-in drawer. The desktop Sidebar is hidden < lg.
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="lg:hidden">
      <div className="flex h-12 items-center justify-between gap-3 border-b border-hairline px-4">
        <button
          onClick={() => setOpen(true)}
          aria-label="Menu"
          className="shrink-0 text-foreground"
        >
          ☰
        </button>
        <div className="min-w-0 flex-1 overflow-hidden">
          <StatusBar />
        </div>
        <WalletButton />
      </div>

      {open && (
        <div className="fixed inset-0 z-[90]" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <nav
            onClick={(e) => e.stopPropagation()}
            className="absolute left-0 top-0 flex h-full w-60 flex-col gap-0.5 border-r border-border bg-surface px-4 py-6"
          >
            <div className="px-2 pb-6">
              <div className="font-display text-base tracking-tight text-foreground">
                moya<span className="text-accent">.</span>terminal
              </div>
            </div>
            {NAV.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`rounded-md px-2 py-2 text-sm transition-colors ${
                    active ? "bg-elevated text-foreground" : "text-muted hover:text-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </div>
  );
}
