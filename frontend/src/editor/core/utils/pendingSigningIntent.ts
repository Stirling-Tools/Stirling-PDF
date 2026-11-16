import { useSyncExternalStore } from "react";

export type SigningIntent =
  | "create"
  | "list"
  | { kind: "request" | "session"; sessionId: string };
let pending: SigningIntent | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const snapshot = () => pending;

/** Carries a rail action across an editor mount; session details are fetched in the workspace. */
export function requestSigningIntent(intent: SigningIntent | null): void {
  pending = intent;
  listeners.forEach((listener) => listener());
}

/** Read and clear after the workspace receives the action. */
export function usePendingSigningIntent(): SigningIntent | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
