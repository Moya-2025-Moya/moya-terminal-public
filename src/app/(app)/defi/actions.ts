"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { AUTH_COOKIE, isValidAuthToken } from "@/lib/auth";
import { defiApi } from "@/lib/zerion";

export type AddWalletState = { ok: boolean; message: string } | null;

function isValidAddress(addr: string): boolean {
  if (addr.startsWith("0x")) return /^0x[a-fA-F0-9]{40}$/.test(addr); // EVM
  return addr.length >= 32 && addr.length <= 44; // Solana base58-ish
}

export async function addWalletAction(
  _prev: AddWalletState,
  formData: FormData,
): Promise<AddWalletState> {
  const store = await cookies();
  if (!(await isValidAuthToken(store.get(AUTH_COOKIE)?.value))) {
    return { ok: false, message: "Authentication required." };
  }

  const address = String(formData.get("address") || "").trim();
  const label = String(formData.get("label") || "").trim();
  const strategy_slug = String(formData.get("strategy_slug") || "").trim();

  if (!isValidAddress(address)) {
    return { ok: false, message: "Enter a valid wallet address (0x… EVM or Solana)." };
  }

  try {
    await defiApi.addWallet({
      address,
      label: label || undefined,
      strategy_slug: strategy_slug || undefined,
    });
    revalidatePath("/defi");
    return {
      ok: true,
      message: `Added ${address.slice(0, 6)}…${address.slice(-4)} - it will appear after the next fetch cycle.`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
