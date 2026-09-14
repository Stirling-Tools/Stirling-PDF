/** Which sweep run, if any, owns the workbench canvas. A module store because the
 *  starting modal unmounts at once and the workbench is not below it in the tree. */

import { useSyncExternalStore } from "react";
import type { ClassificationDemoViewData } from "@app/components/onboarding/classificationDemo/classificationDemoShared";

let run: ClassificationDemoViewData | null = null;
/** Run tokens already started. Here rather than in the view because a remount would
 *  otherwise reset a component ref and start the same run a second time. */
const started = new Set<number>();
/** Documents this session has taken on, so a remount resumes rather than re-sweeping
 *  (and re-metering) the same files. */
const swept = new Set<string>();
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

/** True once per run token: whoever gets it owns starting that sweep. */
export function claimRun(runToken: number): boolean {
  if (started.has(runToken)) return false;
  started.add(runToken);
  return true;
}

/** Paths a follow-up batch should skip, accumulated across the whole session. */
export function sweptPaths(): ReadonlySet<string> {
  return swept;
}

export function recordSwept(paths: readonly string[]): void {
  for (const path of paths) swept.add(path);
}

/** Hand the canvas back. Called only by an explicit dismissal from the view. */
export function endClassificationDemo(): void {
  if (run === null) return;
  run = null;
  started.clear();
  swept.clear();
  emit();
}

export function useClassificationDemoSession(): ClassificationDemoViewData | null {
  return useSyncExternalStore(
    subscribe,
    () => run,
    () => null,
  );
}
