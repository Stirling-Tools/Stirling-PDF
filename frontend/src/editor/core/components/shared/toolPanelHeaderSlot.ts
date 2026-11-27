import { useSyncExternalStore } from "react";

let slot: HTMLElement | null = null;
const listeners = new Set<() => void>();

/**
 * Where the active tool can put its own controls beside the tool panel's
 * title. Module state because the header and the tool mount in separate trees;
 * `attach` is a callback ref, so the slot clears when the header unmounts.
 */
export const toolPanelHeaderSlot = {
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

export function useToolPanelHeaderSlot(): HTMLElement | null {
  return useSyncExternalStore(toolPanelHeaderSlot.subscribe, () => slot);
}
