/** The one background sweep the classification demo can leave running after it hands the
 *  canvas back. A module store: the rail that shows it and the runner that drives it sit
 *  in different trees, and the view that starts it unmounts at once. */

import { useSyncExternalStore } from "react";

export type BackgroundClassificationStatus = "requested" | "running" | "done";

export interface BackgroundClassificationJob {
  status: BackgroundClassificationStatus;
  directory: string;
  /** Shown in the rail tooltip. */
  folderName: string;
  /** Maximum documents to include in this job. */
  limit: number;
  /** Absolute paths earlier sweeps covered, so this one starts where they stopped. */
  exclude: ReadonlySet<string>;
  /** Documents already classified before this job, so the ring does not restart at zero. */
  processed: number;
  /** PDFs in the folder: the ring fills against the whole folder, not this job's batch. */
  total: number;
}

export interface StartBackgroundClassificationOptions {
  directory: string;
  folderName: string;
  limit: number;
  exclude: ReadonlySet<string>;
  alreadyProcessed: number;
  total: number;
}

let job: BackgroundClassificationJob | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Ask for a sweep. Ignored while one is live: the follow-up button is only offered from a
 *  finished view, so a second request means a stale click, not a second folder. */
export function startBackgroundClassification(
  options: StartBackgroundClassificationOptions,
): boolean {
  if (job !== null && job.status !== "done") return false;
  job = {
    status: "requested",
    directory: options.directory,
    folderName: options.folderName,
    limit: options.limit,
    exclude: new Set(options.exclude),
    processed: options.alreadyProcessed,
    total: options.total,
  };
  emit();
  return true;
}

/** Runner-side: take ownership of a requested job. False when there is none, or another
 *  runner already has it. */
export function claimBackgroundClassification(): BackgroundClassificationJob | null {
  if (job === null || job.status !== "requested") return null;
  job = { ...job, status: "running" };
  emit();
  return job;
}

/** Runner-side: `processedInJob` documents done so far in this job. */
export function reportBackgroundClassificationProgress(
  base: number,
  processedInJob: number,
): void {
  if (job === null || job.status !== "running") return;
  const processed = base + processedInJob;
  if (processed === job.processed) return;
  job = { ...job, processed };
  emit();
}

/** Runner-side: the sweep has finished, whatever it managed. The ring shows its tick
 *  and then calls {@link dismissBackgroundClassification}. */
export function finishBackgroundClassification(): void {
  if (job === null) return;
  job = { ...job, status: "done" };
  emit();
}

/** Ring-side: the tick has been seen; take the item off the rail. */
export function dismissBackgroundClassification(): void {
  if (job === null) return;
  job = null;
  emit();
}

export function useBackgroundClassification(): BackgroundClassificationJob | null {
  return useSyncExternalStore(
    subscribe,
    () => job,
    () => null,
  );
}

/** Tests only. */
export function resetBackgroundClassificationForTests(): void {
  job = null;
  listeners.clear();
}
