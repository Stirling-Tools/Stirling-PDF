import { useSyncExternalStore } from "react";

let slot: HTMLElement | null = null;
const listeners = new Set<() => void>();

/**
 * Where the accessibility tool panel lets the review show what it knows about the
 * whole document. Module state because the panel and the review mount in separate
 * trees; `attach` is a callback ref, so the slot clears when the panel unmounts.
 */
export const reviewPanelSlot = {
  attach(element: HTMLElement | null): void {
    if (slot === element) return;
    slot = element;
    listeners.forEach((listener) => listener());
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useReviewPanelSlot(): HTMLElement | null {
  return useSyncExternalStore(reviewPanelSlot.subscribe, () => slot);
}
