"use client";

import { useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { deriveProxyWallet } from "@polymarket/builder-relayer-client";
import type { Address } from "viem";
import { balanceAllowanceFor, refreshCollateral, deriveCreds, SignatureTypeV2 } from "@/lib/polymarket-client";
import { safeAddressFor } from "@/lib/polymarket-safe";
import { depositWalletAddressFor } from "@/lib/polymarket-deposit-wallet";
import { loadCreds, saveCreds } from "@/lib/pm-session";
import { short } from "@/lib/format";

const PROXY_FACTORY = "0xaB45c5A4B0c941a2F231C04C3f49182e1A254052";

type Row = { label: string; funder: string; balance: string; allowance: string };

// Diagnostic: ask CLOB what collateral it credits to this wallet under each
// account model. Whichever row shows your deposited cash is the model the
// terminal must use to trade.
export default function DiagPage() {
  const { address, isConnected } = useAccount();
  const { data: wallet } = useWalletClient();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [rawDump, setRawDump] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function probe() {
    if (!wallet || !address) return;
    setBusy(true);
    setErr(null);
    setRows(null);
    try {
      let creds = loadCreds(address);
      if (!creds) {
        creds = await deriveCreds(wallet);
        saveCreds(address, creds);
      }
      const safe = safeAddressFor(address);
      const proxy = deriveProxyWallet(address, PROXY_FACTORY) as Address;
      const deposit = await depositWalletAddressFor(wallet);

      const combos: { label: string; type: SignatureTypeV2; funder?: Address }[] = [
        { label: "EOA (0)", type: SignatureTypeV2.EOA, funder: undefined },
        { label: "POLY_PROXY (1)", type: SignatureTypeV2.POLY_PROXY, funder: proxy },
        { label: "GNOSIS_SAFE (2)", type: SignatureTypeV2.POLY_GNOSIS_SAFE, funder: safe },
        { label: "DEPOSIT/1271 (3)", type: SignatureTypeV2.POLY_1271, funder: deposit },
      ];

      const out: Row[] = [];
      for (const c of combos) {
        try {
          const r = await balanceAllowanceFor(wallet, creds, c.type, c.funder);
          if (c.type === SignatureTypeV2.POLY_1271) {
            setRawDump(JSON.stringify({ funder: c.funder, balance: r.balance, allowances: r.raw }, null, 2));
          }
          out.push({
            label: c.label,
            funder: c.funder ? short(c.funder) : short(address),
            balance: `$${r.balance.toFixed(2)}`,
            allowance: r.allowance >= 1_000_000 ? "max" : `$${r.allowance.toFixed(2)}`,
          });
        } catch (e) {
          out.push({
            label: c.label,
            funder: c.funder ? short(c.funder) : short(address),
            balance: "err",
            allowance: e instanceof Error ? e.message.slice(0, 24) : "err",
          });
        }
      }
      setRows(out);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Probe failed.");
    } finally {
      setBusy(false);
    }
  }

  async function sync() {
    if (!wallet || !address) return;
    setBusy(true);
    setErr(null);
    try {
      let creds = loadCreds(address);
      if (!creds) {
        creds = await deriveCreds(wallet);
        saveCreds(address, creds);
      }
      const deposit = await depositWalletAddressFor(wallet);
      await refreshCollateral(wallet, creds, deposit); // updateBalanceAllowance for DEPOSIT/1271
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Sync failed.");
    } finally {
      setBusy(false);
    }
    await probe(); // re-read so you can see the allowance flip to max
  }

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-2xl tracking-tight text-foreground">CLOB balance diagnostic</h1>
      <p className="mt-1 text-sm text-muted">
        Asks Polymarket what collateral it credits to your wallet under each account model.
        The row showing your deposited cash is the one the terminal must use.
      </p>

      {!isConnected ? (
        <p className="mt-6 text-sm text-muted">Connect your wallet (top-right).</p>
      ) : (
        <div className="mt-6 space-y-4">
          <div className="flex gap-2">
            <button
              onClick={probe}
              disabled={busy}
              className="rounded-md border border-border px-3 py-2 text-sm text-foreground hover:border-accent disabled:opacity-50"
            >
              {busy ? "…" : "Probe balances"}
            </button>
            <button
              onClick={sync}
              disabled={busy}
              className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-[var(--bg)] hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Syncing…" : "Sync allowance → re-probe"}
            </button>
          </div>
          {err && <p className="text-sm text-neg">{err}</p>}
          {rows && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.12em] text-faint">
                  <th className="pb-2 font-normal">Account model</th>
                  <th className="pb-2 font-normal">Maker</th>
                  <th className="pb-2 text-right font-normal">CLOB balance</th>
                  <th className="pb-2 text-right font-normal">Allowance</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {rows.map((r) => (
                  <tr key={r.label} className="border-t border-hairline">
                    <td className="py-2 text-foreground">{r.label}</td>
                    <td className="py-2 text-muted">{r.funder}</td>
                    <td className={`py-2 text-right ${r.balance !== "$0.00" && r.balance !== "err" ? "text-pos" : "text-muted"}`}>
                      {r.balance}
                    </td>
                    <td className="py-2 text-right text-muted">{r.allowance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {rawDump && (
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-faint">
                DEPOSIT/1271 raw getBalanceAllowance (allowances keyed by spender)
              </div>
              <pre className="select-all overflow-x-auto rounded border border-border bg-elevated p-3 font-mono text-[11px] text-foreground">
                {rawDump}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
