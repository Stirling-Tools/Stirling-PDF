/**
 * Lightweight external store reporting bulk-add progress ("adding file X of Y").
 *
 * `addFiles` reads every file during its pre-dispatch scan (ZIP detection,
 * encryption probe), which for a 200–300 file drop takes real time — without
 * feedback the app looks frozen. This store lets the Files sidebar render a
 * slim progress row during that window without threading new state through the
 * file reducer (whose `ui.isProcessing` drives blocking editor overlays we
 * don't want for a background-feeling bulk add).
 *
 * Read with {@code useSyncExternalStore}; written only by the add pipeline.
 */

import { useSyncExternalStore } from "react";

export interface BulkAddProgress {
  /** Files fully scanned/queued so far. */
  done: number;
  /** Total files in the current add batch. */
  total: number;
}

/** Null object — no bulk add in progress. */
const IDLE: BulkAddProgress = { done: 0, total: 0 };

let progress: BulkAddProgress = IDLE;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Report scan progress. Call with (0, total) to begin, then per file. */
export function reportBulkAddProgress(done: number, total: number): void {
  progress = { done, total };
  emit();
}

/** Clear the indicator (batch finished or aborted). */
export function clearBulkAddProgress(): void {
  if (progress === IDLE) return;
  progress = IDLE;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Current bulk-add progress; `total === 0` means idle. Only shows for batches
 *  large enough that the scan is user-visible (small drops finish instantly). */
export function useBulkAddProgress(): BulkAddProgress {
  return useSyncExternalStore(
    subscribe,
    () => progress,
    () => IDLE,
  );
}
