"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import type { Address } from "viem";
import type { OpenOrder } from "@polymarket/clob-client-v2";
import { clobClient, type ApiKeyCreds } from "@/lib/polymarket-client";
import { depositWalletAddressFor } from "@/lib/polymarket-deposit-wallet";
import { loadCreds } from "@/lib/pm-session";
import { SpotPositions } from "./SpotPositions";

// Account-wide dashboard (center column "Account" tab): all positions + PnL
// (via SpotPositions) plus every open order across markets. Open orders need
// the L2 (HMAC) key - read from the session cache, so this works with no extra
// signature once trading is enabled in the order panel.
export function AccountOverview() {
  const { address, isConnected } = useAccount();
  const { data: wallet } = useWalletClient();
  const [depositWallet, setDepositWallet] = useState<Address | null>(null);

  const [orders, setOrders] = useState<OpenOrder[] | null>(null);
  const [busy, setBusy] = useState(false);

  const creds: ApiKeyCreds | null = address ? loadCreds(address) : null;

  const refresh = useCallback(async () => {
    if (!wallet || !creds) {
      setOrders(null);
      return;
    }
    try {
      if (!depositWallet) return;
      setOrders(await clobClient(wallet, creds, depositWallet).getOpenOrders());
    } catch {
      /* keep prior */
    }
    // creds is derived from address; address change re-runs via deps below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet, depositWallet, address]);

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isConnected) refresh();
  }, [isConnected, refresh]);

  async function cancel(id: string) {
    if (!wallet || !creds || !depositWallet) return;
    setBusy(true);
    try {
      await clobClient(wallet, creds, depositWallet).cancelOrder({ orderID: id });
      await refresh();
    } catch {
      /* list will show it persisted */
    } finally {
      setBusy(false);
    }
  }

  async function cancelAll() {
    if (!wallet || !creds || !depositWallet) return;
    setBusy(true);
    try {
      await clobClient(wallet, creds, depositWallet).cancelAll();
      await refresh();
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-xl tracking-tight text-foreground">Account</h1>
        <p className="mt-1 text-xs text-muted">Your Polymarket positions and working orders.</p>
      </div>

      {/* Positions + PnL (account-wide mode = no conditionId) */}
      <SpotPositions enableClose />

      {/* All open orders across markets */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
            Open orders
          </span>
          <div className="flex items-center gap-3">
            {orders && orders.length > 0 && (
              <button
                onClick={cancelAll}
                disabled={busy}
                className="text-xs text-faint hover:text-neg disabled:opacity-50"
              >
                Cancel all
              </button>
            )}
            <button onClick={refresh} className="text-xs text-faint hover:text-foreground">
              Refresh
            </button>
          </div>
        </div>

        {!creds ? (
          <p className="text-sm text-faint">Enable trading in the order panel to see open orders.</p>
        ) : !orders || orders.length === 0 ? (
          <p className="text-sm text-faint">No open orders.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.12em] text-faint">
                <th className="pb-3 font-normal">Side</th>
                <th className="pb-3 font-normal">Outcome</th>
                <th className="pb-3 text-right font-normal">Price</th>
                <th className="pb-3 text-right font-normal">Remaining</th>
                <th className="pb-3" />
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-hairline font-mono">
                  <td className={`py-2 ${o.side === "BUY" ? "text-pos" : "text-neg"}`}>{o.side}</td>
                  <td className="py-2 text-foreground">{o.outcome}</td>
                  <td className="py-2 text-right text-muted">{o.price}</td>
                  <td className="py-2 text-right text-muted">
                    {(Number(o.original_size) - Number(o.size_matched)).toFixed(0)}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => cancel(o.id)}
                      disabled={busy}
                      className="text-faint hover:text-neg disabled:opacity-50"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
