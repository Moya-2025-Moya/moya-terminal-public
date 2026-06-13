"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Command = { label: string; hint: string; href: string; keys?: string };

const COMMANDS: Command[] = [
  { label: "Overview", hint: "global exposure · equity · activity", href: "/", keys: "g o" },
  { label: "Polymarket", hint: "markets · order entry · positions", href: "/polymarket", keys: "g p" },
  { label: "DeFi", hint: "positions · health · exit", href: "/defi", keys: "g d" },
  { label: "Bots", hint: "remote status & control", href: "/bots", keys: "g b" },
  { label: "Infra", hint: "droplet processes · logs", href: "/infra", keys: "g i" },
  { label: "Discretionary", hint: "CEX / on-chain · read-only", href: "/discretionary", keys: "g x" },
  { label: "Gasless setup", hint: "generate builder key", href: "/setup" },
  { label: "CLOB diagnostic", hint: "balance / allowance probe", href: "/diag" },
  { label: "Recover Safe funds", hint: "pull USDC from the old Safe", href: "/recover" },
];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return COMMANDS;
    return COMMANDS.filter((c) => (c.label + " " + c.hint).toLowerCase().includes(n));
  }, [q]);

  // Global open shortcut (⌘K / Ctrl+K).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Reset + focus on open.
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQ("");
    setIdx(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  if (!open) return null;

  const go = (c?: Command) => {
    if (!c) return;
    setOpen(false);
    router.push(c.href);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 pt-[18vh]"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setIdx(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIdx((i) => Math.min(i + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIdx((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              go(results[idx]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder="Jump to…"
          className="w-full border-b border-hairline bg-transparent px-4 py-3 text-sm text-foreground placeholder:text-faint focus:outline-none"
        />
        <ul className="max-h-80 overflow-y-auto py-1">
          {results.map((c, i) => (
            <li key={c.href}>
              <button
                onMouseEnter={() => setIdx(i)}
                onClick={() => go(c)}
                className={`flex w-full items-center justify-between px-4 py-2 text-left ${
                  i === idx ? "bg-elevated" : ""
                }`}
              >
                <span className="flex min-w-0 items-baseline gap-3">
                  <span className="text-sm text-foreground">{c.label}</span>
                  <span className="truncate text-xs text-muted">{c.hint}</span>
                </span>
                {c.keys && <span className="shrink-0 font-mono text-[10px] text-faint">{c.keys}</span>}
              </button>
            </li>
          ))}
          {results.length === 0 && <li className="px-4 py-3 text-sm text-faint">No match.</li>}
        </ul>
      </div>
    </div>
  );
}
