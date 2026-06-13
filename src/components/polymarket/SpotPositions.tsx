"use client";

import { useEffect, useState, useCallback } from "react";
import { useAccount, useWalletClient } from "wagmi";
import type { Address } from "viem";
import type { PmPosition } from "@/lib/polymarket";
import { usd } from "@/lib/format";
import { marketSellAll } from "@/lib/polymarket-client";
import { loadCreds } from "@/lib/pm-session";
import { depositWalletAddressFor } from "@/lib/polymarket-deposit-wallet";

export function SpotPositions({
  conditionId,
  enableClose,
}: { conditionId?: string; enableClose?: boolean } = {}) {
  const { address, isConnected } = useAccount();
  const { data: wallet } = useWalletClient();
  const [all, setAll] = useState<PmPosition[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [closing, setClosing] = useState<string | null>(null);
  const [closeErr, setCloseErr] = useState<string | null>(null);
  const [depositWallet, setDepositWallet] = useState<Address | null>(null);

  const creds = address ? loadCreds(address) : null;
  const positions = conditionId
    ? all?.filter((p) => p.conditionId === conditionId) ?? null
    : all;

  const load = useCallback(async () => {
    if (!depositWallet) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/pm-data/positions?user=${depositWallet}&sizeThreshold=1&limit=200`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error(`data-api → ${res.status}`);
      const data: PmPosition[] = await res.json();
      data.sort((a, b) => b.currentValue - a.currentValue);
      setAll(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t load positions.");
    } finally {
      setLoading(false);
    }
  }, [depositWallet]);

  useEffect(() => {
    if (!wallet || !address) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDepositWallet(null);
      return;
    }
    let cancelled = false;
    depositWalletAddressFor(wallet)
      .then((walletAddress) => {
        if (!cancelled) setDepositWallet(walletAddress);
      })
      .catch(() => {
        if (!cancelled) setDepositWallet(null);
      });
    return () => {
      cancelled = true;
    };
  }, [wallet, address]);

  useEffect(() => {
    // Fetch positions on connect / address change. load() flips a loading flag
    // synchronously, which is the intended UX for an on-mount fetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isConnected) load();
  }, [isConnected, load]);

  // Market-sell the entire position (one-click close).
  async function close(p: PmPosition) {
    if (!wallet || !creds || !depositWallet) return;
    setClosing(p.asset);
    setCloseErr(null);
    try {
      await marketSellAll(wallet, creds, depositWallet, p.asset, p.size);
      setConfirmId(null);
      await load();
    } catch (e) {
      setCloseErr(e instanceof Error ? e.message : "Close failed.");
    } finally {
      setClosing(null);
    }
  }

  // In single-market mode (center column), stay silent unless a position exists.
  if (!isConnected) {
    return conditionId ? null : <p className="text-sm text-muted">Connect your wallet to see spot positions.</p>;
  }
  if (loading && !positions) {
    return conditionId ? null : <p className="text-sm text-muted">Fetching positions…</p>;
  }
  if (error) {
    return conditionId ? null : <p className="text-sm text-neg">{error}</p>;
  }
  if (!positions || positions.length === 0) {
    return conditionId ? null : <p className="text-sm text-faint">No open positions on Polymarket.</p>;
  }

  const totalValue = positions.reduce((s, p) => s + p.currentValue, 0);
  const totalPnl = positions.reduce((s, p) => s + p.cashPnl, 0);

  return (
    <div>
      {conditionId && (
        <div className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-muted">
          Your position
        </div>
      )}
      <div className={`mb-4 flex items-end gap-10 ${conditionId ? "hidden" : ""}`}>
        <div>
          <div className="text-xs uppercase tracking-[0.14em] text-muted">Value</div>
          <div className="mt-1 font-mono text-2xl text-foreground">{usd(totalValue)}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-[0.14em] text-muted">Unrealized PnL</div>
          <div className={`mt-1 font-mono text-2xl ${totalPnl >= 0 ? "text-pos" : "text-neg"}`}>
            {totalPnl >= 0 ? "+" : ""}
            {usd(totalPnl)}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-[0.12em] text-faint">
              <th className="pb-3 font-normal">Market</th>
              <th className="pb-3 text-right font-normal">Size</th>
              <th className="pb-3 text-right font-normal">Avg</th>
              <th className="pb-3 text-right font-normal">Cur</th>
              <th className="pb-3 text-right font-normal">Value</th>
              <th className="pb-3 text-right font-normal">PnL</th>
              {enableClose && <th className="pb-3" />}
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => (
              <tr key={p.asset} className="border-t border-hairline align-top">
                <td className="py-2.5 pr-4 text-foreground">
                  {p.title}
                  <span className="ml-2 font-mono text-xs text-muted">{p.outcome}</span>
                </td>
                <td className="py-2.5 text-right font-mono text-muted">{p.size.toFixed(0)}</td>
                <td className="py-2.5 text-right font-mono text-muted">{p.avgPrice.toFixed(3)}</td>
                <td className="py-2.5 text-right font-mono text-foreground">{p.curPrice.toFixed(3)}</td>
                <td className="py-2.5 text-right font-mono text-foreground">{usd(p.currentValue)}</td>
                <td className={`py-2.5 text-right font-mono ${p.cashPnl >= 0 ? "text-pos" : "text-neg"}`}>
                  {p.cashPnl >= 0 ? "+" : ""}
                  {usd(p.cashPnl)}
                  <span className="ml-1 text-faint">{p.percentPnl.toFixed(0)}%</span>
                </td>
                {enableClose && (
                  <td className="py-2.5 pl-3 text-right font-mono text-xs">
                    {!creds ? (
                      <span className="text-faint" title="Enable trading first">-</span>
                    ) : confirmId === p.asset ? (
                      <span className="inline-flex items-center gap-1.5">
                        <button
                          onClick={() => close(p)}
                          disabled={closing === p.asset}
                          className="text-neg hover:opacity-80 disabled:opacity-50"
                        >
                          {closing === p.asset ? "…" : `sell ${p.size.toFixed(0)}`}
                        </button>
                        <button onClick={() => setConfirmId(null)} className="text-faint hover:text-foreground">
                          ✕
                        </button>
                      </span>
                    ) : (
                      <button onClick={() => setConfirmId(p.asset)} className="text-faint hover:text-neg">
                        Close
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {closeErr && <p className="mt-2 text-xs text-neg">{closeErr}</p>}
      </div>
    </div>
  );
}
