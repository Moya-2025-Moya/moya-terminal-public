import type { ApiKeyCreds } from "@polymarket/clob-client-v2";

// Session-cache the derived CLOB API key (L1) in localStorage, keyed by EOA.
// The key is deterministic per wallet and grants L2 (HMAC) trading auth only -
// it can place/cancel orders but moves no funds without a per-order EIP-712
// signature. Caching it means we sign the ClobAuth message ONCE, then reuse the
// key across reloads (no more sign-on-every-visit). Single-user, own machine -
// localStorage is the right tradeoff (option A). clearCreds() forces a re-derive.

const KEY = (addr: string) => `pm_creds_${addr.toLowerCase()}`;

function valid(c: unknown): c is ApiKeyCreds {
  return (
    !!c &&
    typeof c === "object" &&
    typeof (c as ApiKeyCreds).key === "string" &&
    typeof (c as ApiKeyCreds).secret === "string" &&
    typeof (c as ApiKeyCreds).passphrase === "string"
  );
}

export function loadCreds(addr: string): ApiKeyCreds | null {
  try {
    const raw = localStorage.getItem(KEY(addr));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return valid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveCreds(addr: string, creds: ApiKeyCreds): void {
  try {
    localStorage.setItem(KEY(addr), JSON.stringify(creds));
  } catch {
    /* storage unavailable - fall back to in-memory only */
  }
}

export function clearCreds(addr: string): void {
  try {
    localStorage.removeItem(KEY(addr));
  } catch {
    /* ignore */
  }
}
