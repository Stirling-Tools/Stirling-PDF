import type { UserbackWidget } from "@userback/widget";

let current: UserbackWidget | null = null;
const listeners = new Set<() => void>();

/** The loaded Userback widget, or null while none is ready to open. */
export function getUserbackInstance(): UserbackWidget | null {
  return current;
}

export function setUserbackInstance(instance: UserbackWidget | null): void {
  current = instance;
  listeners.forEach((listener) => listener());
}

export function subscribeUserbackInstance(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
