"use client";

import { useActionState } from "react";
import { addWalletAction, type AddWalletState } from "@/app/(app)/defi/actions";

const input =
  "w-full rounded-md border border-border bg-elevated px-3 py-2 text-sm text-foreground placeholder:text-faint focus:border-accent focus:outline-none";
const label = "mb-1.5 block text-xs uppercase tracking-[0.12em] text-muted";

export function AddWalletForm({ slugSuggestions }: { slugSuggestions: string[] }) {
  const [state, formAction, isPending] = useActionState<AddWalletState, FormData>(
    addWalletAction,
    null,
  );

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label className={label}>
          Address
        </label>
        <input
          name="address"
          required
          placeholder="0x… or Solana address"
          className={`${input} font-mono`}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label}>
            Label
          </label>
          <input name="label" placeholder="aave-arb-loop" className={input} autoComplete="off" />
        </div>
        <div>
          <label className={label}>
            Strategy slug
          </label>
          <input
            name="strategy_slug"
            placeholder="aave-arb-loop-1"
            className={input}
            list="strategy-slugs"
            autoComplete="off"
          />
          <datalist id="strategy-slugs">
            {slugSuggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-[var(--bg)] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Adding…" : "Add wallet"}
        </button>
        {state && (
          <span
            className={`text-sm ${state.ok ? "text-pos" : "text-neg"}`}
          >
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}
