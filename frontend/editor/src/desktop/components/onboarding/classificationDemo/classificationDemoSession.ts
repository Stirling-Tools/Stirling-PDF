/** Which sweep run, if any, owns the workbench canvas, and how that sweep is going. A
 *  module store because the starting modal unmounts at once, the workbench is not below
 *  it in the tree, and the view can remount while its sweep is still running. */

import { useSyncExternalStore } from "react";
import type { ClassificationDemoViewData } from "@app/components/onboarding/classificationDemo/classificationDemoShared";
import type {
  ClassificationDemoOutcome,
  ClassificationDemoProgress,
} from "@app/components/onboarding/classificationDemo/classificationDemoSweep";

export type ClassificationDemoStatus = "idle" | "running" | "done" | "failed";

export interface ClassificationDemoSweepState {
  status: ClassificationDemoStatus;
  progress: ClassificationDemoProgress;
  /** Every batch of this run folded together, so a follow-up grows the same chart. */
  outcome: ClassificationDemoOutcome | null;
}

export const IDLE_PROGRESS: ClassificationDemoProgress = {
  phase: "reading",
  processed: 0,
  total: 0,
  groups: [],
};

const IDLE_SWEEP: ClassificationDemoSweepState = {
  status: "idle",
  progress: IDLE_PROGRESS,
  outcome: null,
};

let run: ClassificationDemoViewData | null = null;
/** Run tokens already started. Here rather than in the view because a remount would
 *  otherwise reset a component ref and start the same run a second time. */
const started = new Set<number>();
/** Documents this session has taken on, so a remount resumes rather than re-sweeping
 *  (and re-metering) the same files. */
const swept = new Set<string>();
let sweep: ClassificationDemoSweepState = IDLE_SWEEP;
/** Moves on at every start and stop, so a sweep that was stopped, and is only noticing
 *  between files, cannot write its progress into the one that replaced it. */
let sweepGeneration = 0;
const listeners = new Set<() => void>();
const HAS_RUN_KEY = "stirling-desktop-classification-demo-has-run";
let hasRun = false;

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
  hasRun = true;
  try {
    localStorage.setItem(HAS_RUN_KEY, "true");
  } catch {
    // The session still remembers the run when persistent storage is unavailable.
  }
  emit();
  return true;
}

function getHasRun(): boolean {
  if (hasRun) return true;
  try {
    return localStorage.getItem(HAS_RUN_KEY) === "true";
  } catch {
    return false;
  }
}

/** Dismissing the offer does not count as running the demo; the first claimed run does. */
export function useClassificationDemoHasRun(): boolean {
  return useSyncExternalStore(subscribe, getHasRun, () => false);
}

/** Paths a follow-up batch should skip, accumulated across the whole session. */
export function sweptPaths(): ReadonlySet<string> {
  return swept;
}

export function recordSwept(paths: readonly string[]): void {
  for (const path of paths) swept.add(path);
}

/** Starts a sweep's record, keeping the outcome earlier batches of this run produced.
 *  Returns the generation the sweep must pass to {@link updateSweep}. */
export function beginSweep(): number {
  sweepGeneration += 1;
  sweep = {
    status: "running",
    progress: IDLE_PROGRESS,
    outcome: sweep.outcome,
  };
  emit();
  return sweepGeneration;
}

/** False once the sweep that holds `generation` has been stopped or replaced. */
export function isSweepCurrent(generation: number): boolean {
  return generation === sweepGeneration;
}

/** Ignored unless `generation` is still current. */
export function updateSweep(
  generation: number,
  update: (
    current: ClassificationDemoSweepState,
  ) => Partial<ClassificationDemoSweepState>,
): void {
  if (!isSweepCurrent(generation)) return;
  sweep = { ...sweep, ...update(sweep) };
  emit();
}

/** Stops the running sweep at its next file. A no-op once it has finished, so a
 *  finished sweep's result stays on screen. */
export function stopSweep(): void {
  if (sweep.status !== "running") return;
  sweepGeneration += 1;
  sweep = { ...sweep, status: "idle" };
  emit();
}

export function useClassificationDemoSweep(): ClassificationDemoSweepState {
  return useSyncExternalStore(
    subscribe,
    () => sweep,
    () => IDLE_SWEEP,
  );
}

/** Hand the canvas back. Called only by an explicit dismissal from the view. */
export function endClassificationDemo(): void {
  if (run === null) return;
  run = null;
  started.clear();
  swept.clear();
  sweepGeneration += 1;
  sweep = IDLE_SWEEP;
  emit();
}

export function useClassificationDemoSession(): ClassificationDemoViewData | null {
  return useSyncExternalStore(
    subscribe,
    () => run,
    () => null,
  );
}
