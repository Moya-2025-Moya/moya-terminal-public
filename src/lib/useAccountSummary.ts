"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useAccount, useWalletClient } from "wagmi";
import type { WalletClient } from "viem";
import type { PmPosition } from "@/lib/polymarket";
import { depositWalletAddressFor, pusdBalance } from "@/lib/polymarket-deposit-wallet";

// SINGLETON account state. Every consumer (status bar, overview, positions,
// account tab) shares ONE poller + ONE deposit-wallet derivation + ONE fetch,
// instead of each component spinning up its own 30s RPC-heavy loop. This is the
// difference between smooth and janky.

export interface AccountSummary {
  cash: number | null; // deposit-wallet pUSD
  value: number; // open positions value
  pnl: number; // unrealized PnL
  held: Set<string>; // conditionIds held
  loading: boolean;
}

const EMPTY: AccountSummary = { cash: null, value: 0, pnl: 0, held: new Set(), loading: false };
const POLL_MS = 30_000;

let summary: AccountSummary = EMPTY;
let pollAddr: string | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

async function load(wallet: WalletClient) {
  try {
    const dw = await depositWalletAddressFor(wallet);
    const [posRaw, cash] = await Promise.all([
      fetch(`/api/pm-data/positions?user=${dw}&sizeThreshold=1&limit=200`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
      pusdBalance(dw).catch(() => null),
    ]);
    const positions: PmPosition[] = Array.isArray(posRaw) ? posRaw : [];
    summary = {
      cash,
      value: positions.reduce((a, p) => a + p.currentValue, 0),
      pnl: positions.reduce((a, p) => a + p.cashPnl, 0),
      held: new Set(positions.map((p) => p.conditionId)),
      loading: false,
    };
    emit();
  } catch {
    /* keep prior summary */
  }
}

function ensure(address: string | undefined, wallet: WalletClient | undefined) {
  if (!address || !wallet) {
    if (pollAddr !== null) {
      pollAddr = null;
      if (timer) clearInterval(timer);
      timer = null;
      summary = EMPTY;
      emit();
    }
    return;
  }
  const key = address.toLowerCase();
  if (pollAddr === key) return; // already polling this wallet - no new loop
  pollAddr = key;
  if (timer) clearInterval(timer);
  load(wallet);
  timer = setInterval(() => load(wallet), POLL_MS);
}

export function useAccountSummary(): AccountSummary {
  const { address, isConnected } = useAccount();
  const { data: wallet } = useWalletClient();

  useEffect(() => {
    ensure(isConnected ? address : undefined, wallet ?? undefined);
  }, [isConnected, address, wallet]);

  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => summary,
    () => EMPTY,
  );
}
