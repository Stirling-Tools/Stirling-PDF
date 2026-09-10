/** Which sweep run, if any, owns the workbench canvas. A module store because the
 *  starting modal unmounts at once and the workbench is not below it in the tree. */

import { useSyncExternalStore } from "react";
import type { ClassificationDemoViewData } from "@app/components/onboarding/classificationDemo/classificationDemoShared";

let run: ClassificationDemoViewData | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Take over the canvas for a sweep of `limit` documents. */
export function startClassificationDemo(limit: number): void {
  // A fresh token every time, so asking for a second batch re-runs the sweep even when
  // the limit happens to match the last one.
  run = { limit, runToken: Date.now() };
  emit();
}

/** Hand the canvas back. Called only by an explicit dismissal from the view. */
export function endClassificationDemo(): void {
  if (run === null) return;
  run = null;
  emit();
}

export function useClassificationDemoSession(): ClassificationDemoViewData | null {
  return useSyncExternalStore(
    subscribe,
    () => run,
    () => null,
  );
}
