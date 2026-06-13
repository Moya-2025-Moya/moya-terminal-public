"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/app/login/actions";

export function LoginForm({ from }: { from: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    loginAction,
    null,
  );

  return (
    <form action={action} className="w-full max-w-sm">
      <input type="hidden" name="from" value={from} />
      <label className="mb-2 block text-xs uppercase tracking-[0.15em] text-muted">
        Password
      </label>
      <input
        name="password"
        type="password"
        autoFocus
        autoComplete="current-password"
        placeholder="••••••••"
        className="w-full rounded-md border border-border bg-surface px-3 py-2.5 font-mono text-foreground placeholder:text-faint focus:border-accent focus:outline-none"
      />
      {state?.error && (
        <p className="mt-2 text-sm text-[var(--neg)]">{state.error}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="mt-4 w-full rounded-md bg-accent px-3 py-2.5 text-sm font-medium text-[var(--bg)] transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Checking…" : "Unlock terminal"}
      </button>
    </form>
  );
}
