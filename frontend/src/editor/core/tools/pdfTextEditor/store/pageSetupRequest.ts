import { useSyncExternalStore } from "react";

export interface PageSetupRequest {
  pageIndex: number;
  clientX: number;
  clientY: number;
}

let request: PageSetupRequest | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export const pageSetupRequest = {
  open(next: PageSetupRequest): void {
    request = next;
    notify();
  },
  close(): void {
    if (!request) return;
    request = null;
    notify();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function usePageSetupRequest(): PageSetupRequest | null {
  return useSyncExternalStore(pageSetupRequest.subscribe, () => request);
}
