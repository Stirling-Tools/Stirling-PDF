import { useSyncExternalStore } from "react";

type SigningIntent = "create" | "list";
let pending: SigningIntent | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const snapshot = () => pending;

/** Carries the rail action across an editor mount, including when the signing tool is already open. */
export function requestSigningIntent(intent: SigningIntent | null): void {
  pending = intent;
  listeners.forEach((listener) => listener());
}

/** Read and clear after the tool receives the action; no document or account data is retained. */
export function usePendingSigningIntent(): SigningIntent | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
