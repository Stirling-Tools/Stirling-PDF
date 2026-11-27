import { useSyncExternalStore } from "react";

let obstacle: HTMLElement | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Ref for a bar docked along the workbench's bottom edge; the feedback tag rises above it only where the two would meet. */
export function registerFeedbackTagObstacle(element: HTMLElement | null) {
  if (obstacle === element) return;
  obstacle = element;
  listeners.forEach((listener) => listener());
}

export function useFeedbackTagObstacle(): HTMLElement | null {
  return useSyncExternalStore(
    subscribe,
    () => obstacle,
    () => null,
  );
}
