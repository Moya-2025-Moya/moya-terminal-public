"use client";

import { useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { deriveCreds, createBuilderKey } from "@/lib/polymarket-client";
import { loadCreds, saveCreds } from "@/lib/pm-session";

// One-time setup: generate a Polymarket BUILDER api key. The three values go into
// the server's POLY_BUILDER_API_KEY/SECRET/PASSPHRASE env so the relayer accepts
// our gasless deposit-wallet transactions (deploy / approve / withdraw). No VPN,
// no gas - routed through the droplet's NL IP.
export default function SetupPage() {
  const { address, isConnected } = useAccount();
  const { data: wallet } = useWalletClient();
  const [busy, setBusy] = useState(false);
  const [bk, setBk] = useState<{ key: string; secret: string; passphrase: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function generate() {
    if (!wallet || !address) return;
    setBusy(true);
    setErr(null);
    try {
      let creds = loadCreds(address);
      if (!creds) {
        creds = await deriveCreds(wallet);
        saveCreds(address, creds);
      }
      setBk(await createBuilderKey(wallet, creds));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn’t create builder key.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-xl">
      <h1 className="font-display text-2xl tracking-tight text-foreground">Gasless setup</h1>
      <p className="mt-1 text-sm text-muted">
        Generate a Polymarket builder key to unlock gasless deposit-wallet actions through the droplet.
      </p>

      {!isConnected ? (
        <p className="mt-6 text-sm text-muted">Connect your wallet (top-right) to continue.</p>
      ) : (
        <div className="mt-6 space-y-4">
          <button
            onClick={generate}
            disabled={busy}
            className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-[var(--bg)] hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Generating…" : "Generate builder key"}
          </button>

          {err && <p className="text-sm text-neg">{err}</p>}

          {bk && (
            <div className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
              <p className="text-xs text-warn">
                Copy these three values and send them to me (they go into Railway env). One-time only.
              </p>
              <Field label="POLY_BUILDER_API_KEY" value={bk.key} />
              <Field label="POLY_BUILDER_SECRET" value={bk.secret} />
              <Field label="POLY_BUILDER_PASSPHRASE" value={bk.passphrase} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.14em] text-faint">{label}</div>
      <div className="mt-0.5 select-all break-all rounded border border-border bg-elevated px-2 py-1 font-mono text-xs text-foreground">
        {value}
      </div>
    </div>
  );
}
