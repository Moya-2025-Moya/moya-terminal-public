"use client";

import { useSyncExternalStore } from "react";

// Tiny bus so clicking a price level in the order book (center column) prefills
// the order panel (right column). nonce makes repeated clicks on the same level
// still fire an update. The order panel applies a draft only if the tokenId
// belongs to the market it's showing.

export interface OrderDraft {
  tokenId: string;
  side: "buy" | "sell";
  price: number;
  size?: number;
  nonce: number;
}

let draft: OrderDraft | null = null;
let nonce = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function getDraft(): OrderDraft | null {
  return draft;
}

export function setOrderDraft(d: Omit<OrderDraft, "nonce">): void {
  draft = { ...d, nonce: ++nonce };
  emit();
}

export function useOrderDraft(): OrderDraft | null {
  return useSyncExternalStore(subscribe, getDraft, () => null);
}
