"use client";

import { useSyncExternalStore } from "react";

// Per-market price/probability alerts ("notify me when YES ≥ 0.70"). Stored in
// localStorage, exposed through a tiny subscribable store so the alarm panel and
// the global checker stay in sync. The checker (useAlarmChecker) polls midpoints
// while the tab is open and fires a browser notification on cross. Always-on
// (tab closed) firing would need the droplet - a later follow-up.

export type AlarmOp = "gte" | "lte";

export interface Alarm {
  id: string;
  conditionId: string;
  title: string;
  tokenId: string;
  outcome: string;
  op: AlarmOp;
  threshold: number; // 0..1 probability
  triggered: boolean;
  createdTs: number;
}

const STORAGE_KEY = "pm_alarms";
const EMPTY: Alarm[] = [];

let alarms: Alarm[] = load();
let seq = 0;
const listeners = new Set<() => void>();

function load(): Alarm[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(alarms));
  } catch {
    /* ignore */
  }
}

function emit() {
  for (const l of listeners) l();
}

export function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function getAlarms(): Alarm[] {
  return alarms;
}

export function addAlarm(
  a: Omit<Alarm, "id" | "triggered" | "createdTs">,
): void {
  const ts = Date.now();
  const alarm: Alarm = { ...a, id: `${ts}-${seq++}`, triggered: false, createdTs: ts };
  alarms = [...alarms, alarm];
  persist();
  emit();
}

export function removeAlarm(id: string): void {
  alarms = alarms.filter((a) => a.id !== id);
  persist();
  emit();
}

export function markTriggered(id: string): void {
  alarms = alarms.map((a) => (a.id === id ? { ...a, triggered: true } : a));
  persist();
  emit();
}

/** Subscribe to the full alarm list (re-renders on any change). */
export function useAlarms(): Alarm[] {
  return useSyncExternalStore(
    subscribe,
    getAlarms,
    () => EMPTY, // SSR snapshot
  );
}
