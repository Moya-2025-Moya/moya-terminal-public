import { ClobClient, OrderType, Side, AssetType, SignatureTypeV2 } from "@polymarket/clob-client-v2";
import type { ApiKeyCreds, SignedOrder } from "@polymarket/clob-client-v2";
import type { WalletClient } from "viem";

// Browser-side CLOB client - Polymarket CLOB **v2** SDK. The CTF Exchange order
// format migrated (Apr 2026); v1 orders are rejected with "Invalid order
// version". v2 signs the current order schema.
//
// Routes through our same-origin /api/pm forward route (which adds the proxy
// bearer server-side → droplet polymarket-proxy → clob.polymarket.com). The L2
// HMAC is over the bare endpoint path, so the /api/pm prefix doesn't affect it.
// Polymarket settles on Polygon (137). Terminal holds no keys: L1 order signing
// + L2 HMAC both happen client-side via the connected wallet.

export const PM_HOST = "/api/pm";
export const PM_CHAIN = 137;

export { OrderType, Side, AssetType };
export type { ApiKeyCreds, SignedOrder };

// funderAddress = the user's Polymarket deposit wallet. When set, orders use
// signatureType=3 (POLY_1271): the EOA signs the wrapped typed data and the
// deposit wallet is the maker/signer verified by EIP-1271. Omit it for L1 auth
// (deriveApiKey), which uses the EOA directly.
export function clobClient(
  wallet: WalletClient,
  creds?: ApiKeyCreds,
  funderAddress?: string,
) {
  return new ClobClient({
    host: PM_HOST,
    chain: PM_CHAIN,
    signer: wallet,
    creds,
    signatureType: funderAddress ? SignatureTypeV2.POLY_1271 : undefined,
    funderAddress,
    throwOnError: true, // surface CLOB rejections (4xx) as thrown errors
  });
}

/** Market-sell an entire position (one-click close). FOK = fill-or-kill against
 * the current book. Signs once (wallet popup); throwOnError surfaces rejections. */
export async function marketSellAll(
  wallet: WalletClient,
  creds: ApiKeyCreds,
  funderAddress: string,
  tokenId: string,
  size: number,
) {
  const c = clobClient(wallet, creds, funderAddress);
  const signed = await c.createMarketOrder({ tokenID: tokenId, amount: size, side: Side.SELL }, {});
  return c.postOrder(signed, OrderType.FOK);
}

/** L1 step - one wallet signature to obtain the API key (creds).
 * Create-FIRST, then derive on conflict. deriveApiKey computes the key locally
 * from the L1 signature, but if this wallet never *created* a key on the CLOB,
 * that derived key doesn't exist server-side → every L2 call returns
 * "Unauthorized/Invalid api key". createApiKey registers it; if it already
 * exists (create throws), deriveApiKey returns the same one. With throwOnError
 * on, the SDK's own createOrDeriveApiKey won't fall back, so we do it here. */
export async function deriveCreds(wallet: WalletClient): Promise<ApiKeyCreds> {
  const client = clobClient(wallet);
  try {
    return await client.createApiKey();
  } catch {
    return await client.deriveApiKey();
  }
}

/** Diagnostic: ask CLOB what COLLATERAL balance/allowance it holds for a given
 * (signatureType, funder) combo. Used to locate which account model the user's
 * deposited cash is credited under. Returns balance+allowance as USDC numbers. */
export async function balanceAllowanceFor(
  wallet: WalletClient,
  creds: ApiKeyCreds,
  signatureType: SignatureTypeV2,
  funderAddress?: string,
): Promise<{ balance: number; allowance: number; raw: Record<string, string> }> {
  const c = new ClobClient({
    host: PM_HOST,
    chain: PM_CHAIN,
    signer: wallet,
    creds,
    signatureType,
    funderAddress,
    throwOnError: true,
  });
  const ba = await c.getBalanceAllowance({ asset_type: AssetType.COLLATERAL });
  const raw = ba.allowances ?? {};
  const allowances = Object.values(raw).map((v) => Number(v) / 1e6);
  const allowance = allowances.length ? Math.min(...allowances) : 0;
  return { balance: Number(ba.balance) / 1e6, allowance, raw };
}

export { SignatureTypeV2 };

/** Force CLOB to re-read the maker's on-chain USDC balance + allowance. CLOB
 * caches balance-allowance per wallet; right after funding/approving the cache
 * is stale (0), so orders bounce with "balance: 0". Call this first. L2-authed,
 * no popup; signature_type/funder come from the client. */
export async function refreshCollateral(
  wallet: WalletClient,
  creds: ApiKeyCreds,
  funderAddress: string,
): Promise<void> {
  await clobClient(wallet, creds, funderAddress).updateBalanceAllowance({
    asset_type: AssetType.COLLATERAL,
  });
}

/** Generate a Polymarket BUILDER api key (key/secret/passphrase) from an existing
 * CLOB key. These go into the server's POLY_BUILDER_* env so pm-forward can sign
 * relayer requests → unlocks gasless deposit-wallet deploy/approve/withdraw.
 * L2-authed (HMAC over creds) - no wallet popup. */
export async function createBuilderKey(
  wallet: WalletClient,
  creds: ApiKeyCreds,
): Promise<{ key: string; secret: string; passphrase: string }> {
  return clobClient(wallet, creds).createBuilderApiKey();
}

/** True if an error looks like a CLOB L2 auth failure (stale/invalid api key). */
export function isAuthError(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e);
  return /unauthorized|invalid api key/i.test(m);
}
