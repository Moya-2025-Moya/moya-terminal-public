"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useWalletClient, useSendTransaction } from "wagmi";
import { polygon } from "wagmi/chains";
import { useSwitchChain } from "wagmi";
import { safeAddressFor } from "@/lib/polymarket-safe";
import { buildSafeWithdraw } from "@/lib/polymarket-safe-deploy";
import { usdcBalance } from "@/lib/polymarket-deposit-wallet";
import { short } from "@/lib/format";

// Standalone recovery: pull USDC.e out of the OLD Polymarket Safe back to the
// EOA. Self-contained - does not depend on the order panel. The EOA owner submits
// Safe.execTransaction(USDC.transfer(eoa, amount)) itself, so a pre-validated
// owner signature is accepted (no extra signing popup, just the tx confirm).
export default function RecoverPage() {
  const { address, isConnected, chainId } = useAccount();
  const { data: wallet } = useWalletClient();
  const { sendTransactionAsync } = useSendTransaction();
  const { switchChain } = useSwitchChain();

  const safe = address ? safeAddressFor(address) : undefined;
  const onPolygon = chainId === polygon.id;

  const [bal, setBal] = useState<number | null>(null);
  const [amt, setAmt] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!safe) return;
    try {
      const b = await usdcBalance(safe);
      setBal(b);
      setAmt(b.toFixed(2));
    } catch {
      /* leave as-is */
    }
  }, [safe]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (address) load();
  }, [address, load]);

  async function withdraw() {
    if (!address || !safe) return;
    if (!(Number(amt) > 0)) return setMsg({ ok: false, text: "Amount must be > 0." });
    setBusy(true);
    setMsg(null);
    try {
      const tx = buildSafeWithdraw(address, safe, amt);
      const hash = await sendTransactionAsync({ to: tx.to, data: tx.data });
      setMsg({ ok: true, text: `Withdrawal sent - tx ${short(hash)}. Balance updates shortly.` });
      setTimeout(load, 5000);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Withdraw failed." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-md">
      <h1 className="font-display text-2xl tracking-tight text-foreground">Recover Safe funds</h1>
      <p className="mt-1 text-sm text-muted">
        Pull USDC.e out of your old Polymarket Safe back to your wallet (EOA).
      </p>

      {!isConnected ? (
        <p className="mt-6 text-sm text-muted">Connect your wallet (top-right) to continue.</p>
      ) : !onPolygon ? (
        <button
          onClick={() => switchChain({ chainId: polygon.id })}
          className="mt-6 rounded-md bg-accent px-3 py-2 text-sm font-medium text-[var(--bg)] hover:opacity-90"
        >
          Switch to Polygon
        </button>
      ) : (
        <div className="mt-6 space-y-4">
          <div className="space-y-1 rounded-lg border border-hairline bg-surface p-4 text-sm">
            <Row label="Your wallet (EOA)" value={address ? short(address) : "-"} />
            <Row label="Old Safe" value={safe ? short(safe) : "-"} />
            <Row
              label="Safe balance"
              value={bal == null ? "…" : `$${bal.toFixed(2)}`}
              strong
            />
          </div>

          <div className="flex gap-2">
            <input
              value={amt}
              onChange={(e) => setAmt(e.target.value)}
              inputMode="decimal"
              className="w-32 rounded-md border border-border bg-elevated px-2.5 py-2 font-mono text-sm text-foreground focus:border-accent focus:outline-none"
            />
            <button
              onClick={() => bal != null && setAmt(bal.toFixed(2))}
              className="rounded-md border border-border px-3 py-2 text-sm text-muted hover:border-accent"
            >
              Max
            </button>
            <button
              onClick={withdraw}
              disabled={busy || !(Number(amt) > 0)}
              className="flex-1 rounded-md bg-accent px-3 py-2 text-sm font-medium text-[var(--bg)] hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Withdrawing…" : `Withdraw $${amt || "0"} to wallet`}
            </button>
          </div>

          {msg && <p className={`text-sm ${msg.ok ? "text-pos" : "text-neg"}`}>{msg.text}</p>}

          <button onClick={load} className="text-xs text-faint hover:text-foreground">
            Refresh balance
          </button>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-muted">{label}</span>
      <span className={`font-mono ${strong ? "text-foreground" : "text-muted"}`}>{value}</span>
    </div>
  );
}
