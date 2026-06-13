"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useWalletClient, useWriteContract } from "wagmi";
import type { Address } from "viem";
import {
  checkApprovals,
  deployDepositWallet,
  depositWalletAddressFor,
  fundDepositWalletTx,
  isDepositWalletDeployed,
  setDepositWalletApprovals,
  usdcBalance,
  pusdBalance,
  withdrawDepositWallet,
} from "@/lib/polymarket-deposit-wallet";
import { short } from "@/lib/format";

// Polymarket deposit wallet onboarding: derive -> deploy directly -> approve
// via signed deposit-wallet batch -> fund from the EOA.
function StatusRow({ label, ok, value }: { label: string; ok: boolean | null; value?: string }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-muted">{label}</span>
      <span className="font-mono">
        {value ??
          (ok == null ? (
            <span className="text-faint">...</span>
          ) : ok ? (
            <span className="text-pos">ready</span>
          ) : (
            <span className="text-warn">needed</span>
          ))}
      </span>
    </div>
  );
}

function friendlyError(e: unknown, fallback: string) {
  const message = e instanceof Error ? e.message : String(e);
  if (/invalid authorization|status[":]?401|401/i.test(message)) {
    return "Authorization failed. Refresh, reconnect MetaMask, and make sure you are using the same wallet on Polygon.";
  }
  return message || fallback;
}

export function DepositWalletOnboarding({
  onReady,
}: {
  onReady: (walletAddress: Address) => void;
}) {
  const { address } = useAccount();
  const { data: wallet } = useWalletClient();
  const { writeContractAsync } = useWriteContract();

  const [depositWallet, setDepositWallet] = useState<Address | null>(null);
  const [deployed, setDeployed] = useState<boolean | null>(null);
  const [approved, setApproved] = useState<boolean | null>(null);
  const [walletBal, setWalletBal] = useState<number | null>(null);
  const [eoaBal, setEoaBal] = useState<number | null>(null);
  const [amount, setAmount] = useState("10");
  const [busy, setBusy] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!wallet || !address) return;
    try {
      const walletAddress = await depositWalletAddressFor(wallet);
      setDepositWallet(walletAddress);
      const [isDeployed, depositBalance, eoaBalance] = await Promise.all([
        isDepositWalletDeployed(walletAddress),
        pusdBalance(walletAddress), // deposit wallet's tradeable collateral is pUSD
        usdcBalance(address), // EOA holds USDC.e
      ]);
      const hasApprovals = isDeployed ? await checkApprovals(walletAddress) : false;
      setDeployed(isDeployed);
      setWalletBal(depositBalance);
      setEoaBal(eoaBalance);
      setApproved(hasApprovals);
      if (isDeployed && hasApprovals && depositBalance > 0) onReady(walletAddress);
    } catch (e) {
      setErr(friendlyError(e, "Couldn't read deposit wallet status."));
    }
  }, [wallet, address, onReady]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (address && wallet) refresh();
  }, [address, wallet, refresh]);

  async function run(kind: string, fn: () => Promise<void>) {
    setBusy(kind);
    setErr(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setErr(friendlyError(e, `${kind} failed.`));
    } finally {
      setBusy("");
    }
  }

  if (!wallet || !address) return null;

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[11px] uppercase tracking-[0.1em] text-muted">
          Polymarket deposit wallet
        </div>
        <div className="mt-1 font-mono text-sm text-foreground">
          {depositWallet ? short(depositWallet) : "..."}
        </div>
      </div>

      <div className="border-y border-hairline py-1">
        <StatusRow label="Deployed" ok={deployed} />
        <StatusRow label="Approvals" ok={approved} />
        <StatusRow
          label="Deposit balance"
          ok={null}
          value={walletBal == null ? "..." : `$${walletBal.toFixed(2)}`}
        />
        <StatusRow
          label="Wallet (EOA) USDC.e"
          ok={null}
          value={eoaBal == null ? "..." : `$${eoaBal.toFixed(2)}`}
        />
      </div>

      {!deployed && (
        <button
          onClick={() =>
            run("deploy", async () => {
              await deployDepositWallet(wallet);
            })
          }
          disabled={!!busy}
          className="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-[var(--bg)] hover:opacity-90 disabled:opacity-50"
        >
          {busy === "deploy" ? "Deploying wallet..." : "Deploy deposit wallet"}
        </button>
      )}
      {deployed && !approved && (
        <button
          onClick={() =>
            depositWallet &&
            run("approve", async () => {
              await setDepositWalletApprovals(wallet, depositWallet);
            })
          }
          disabled={!!busy}
          className="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-[var(--bg)] hover:opacity-90 disabled:opacity-50"
        >
          {busy === "approve" ? "Setting approvals..." : "Approve tokens"}
        </button>
      )}
      {deployed && (
        <div className="flex gap-2">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            className="w-24 rounded-md border border-border bg-elevated px-2.5 py-2 font-mono text-sm text-foreground focus:border-accent focus:outline-none"
          />
          <button
            onClick={() =>
              depositWallet &&
              run("fund", async () => {
                await writeContractAsync(fundDepositWalletTx(depositWallet, amount));
              })
            }
            disabled={!!busy || !(eoaBal && eoaBal > 0)}
            className="flex-1 rounded-md border border-border px-3 py-2 text-sm text-foreground hover:border-accent disabled:opacity-50"
          >
            {busy === "fund" ? "Funding..." : `Fund deposit wallet with $${amount}`}
          </button>
        </div>
      )}
      {deployed && walletBal != null && walletBal > 0 && (
        <button
          onClick={() =>
            depositWallet &&
            run("withdraw", async () => {
              await withdrawDepositWallet(wallet, depositWallet, address, amount);
            })
          }
          disabled={!!busy || !(Number(amount) > 0)}
          className="w-full rounded-md border border-border px-3 py-2 text-sm text-foreground hover:border-accent disabled:opacity-50"
        >
          {busy === "withdraw" ? "Withdrawing..." : `Withdraw $${amount} to EOA`}
        </button>
      )}

      {err && <p className="text-sm text-neg">{err}</p>}
      <button onClick={() => refresh()} className="text-xs text-faint hover:text-foreground">
        Refresh status
      </button>
    </div>
  );
}

export const SafeOnboarding = DepositWalletOnboarding;
