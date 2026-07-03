/**
 * External store for real backend policy runs (auto-run on upload).
 *
 * The auto-run controller fires a backend run for each enabled policy × each
 * newly-uploaded file and records it here; the detail view's activity feed reads
 * from it. `dispatched` keys (`categoryId:fileId`) ensure a given file is only
 * ever run once per policy, surviving remounts via localStorage.
 *
 * Read with {@code useSyncExternalStore}; mutated by the controller.
 */

import { useSyncExternalStore } from "react";
import type {
  PolicyExecutionTarget,
  PolicyRunStatus,
} from "@app/services/policyPipeline";

export interface PolicyRunRecord {
  runId: string;
  categoryId: string;
  fileId: string;
  fileName: string;
  fileSize: number;
  target: PolicyExecutionTarget;
  status: PolicyRunStatus;
  /** Pipeline progress reported by the run-status endpoint: the 1-based step
   *  currently running, and the total step count. Drive the "step X/Y" label
   *  while a run is in flight. Absent until the first status report. */
  currentStep?: number;
  stepCount?: number;
  /** Output files (downloadable via /api/v1/general/files/{id}) once done. */
  outputs: { fileId: string; fileName: string }[];
  /** True once ALL outputs have been imported into the workspace. */
  imported?: boolean;
  /** Output fileIds already imported — tracked per-file so a partial failure
   *  retries only the missing ones and never re-adds the ones that succeeded. */
  importedFileIds?: string[];
  /** Workspace fileIds of the imported output files (the versioned child for
   *  "new version", or the added file for "new file"). Drives the policy badge,
   *  which marks the policy's OUTPUT — not the input it ran on. */
  outputFileIds?: string[];
  error: string | null;
  /** Stable backend failure code (e.g. an entitlement sentinel) when FAILED; null otherwise. */
  errorCode?: string | null;
  /** Set while an auto-retry is pending after a transient (queue-full) rejection, so the activity
   *  feed shows a soft "busy" row instead of a hard failure during the backoff window. */
  retrying?: boolean;
  /** Epoch ms when the run was dispatched. */
  startedAt: number;
}

interface RunState {
  runs: PolicyRunRecord[];
  dispatched: string[];
  /** startedAt of the run that began the current processing "wave" — a burst of
   *  runs with no idle gap. Reset whenever a run is recorded while nothing is in
   *  flight. The panel's progress counts (X of Y processed) scope to this so they
   *  reflect the CURRENT upload, not the whole persisted history. */
  waveStartedAt: number;
}

const IN_FLIGHT_STATUSES: ReadonlySet<PolicyRunStatus> = new Set([
  "PENDING",
  "RUNNING",
  "WAITING_FOR_INPUT",
]);

/** True while a run is still working: dispatched/running, in a retry backoff, or
 *  done on the backend but not yet imported into the workspace. Shared so the
 *  wave tracking, the panel progress, and the file-row spinner all agree. */
export function isRunInFlight(run: PolicyRunRecord): boolean {
  if (run.retrying) return true;
  if (IN_FLIGHT_STATUSES.has(run.status)) return true;
  return run.status === "COMPLETED" && !run.imported;
}

const STORAGE_KEY = "stirling-policy-runs";
/** Soft cap on stored runs so the activity log can't grow without bound. Only
 *  TERMINAL runs are ever evicted (see {@link capRuns}); in-flight runs are always
 *  kept, so a large upload batch (more files than this cap) still polls + imports
 *  every one — and the panel's processing count stays accurate. */
const MAX_RUNS = 200;

const TERMINAL: ReadonlySet<PolicyRunStatus> = new Set([
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);

/**
 * Trim the run list toward MAX_RUNS by dropping the OLDEST terminal runs first,
 * never in-flight ones. Runs are newest-first, so we walk from the tail. If more
 * than MAX_RUNS runs are still in flight (a very large batch) they're all kept —
 * dropping a live run would orphan its polling/import and undercount progress.
 */
function capRuns(runs: PolicyRunRecord[]): PolicyRunRecord[] {
  if (runs.length <= MAX_RUNS) return runs;
  const trimmed = [...runs];
  for (let i = trimmed.length - 1; i >= 0 && trimmed.length > MAX_RUNS; i--) {
    if (TERMINAL.has(trimmed[i].status)) trimmed.splice(i, 1);
  }
  return trimmed;
}

function read(): RunState {
  try {
    const raw =
      typeof localStorage !== "undefined"
        ? localStorage.getItem(STORAGE_KEY)
        : null;
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<RunState>;
      return {
        // Normalise older persisted records (which predate the `outputs` field)
        // so consumers can always rely on `outputs` being an array.
        runs: Array.isArray(parsed.runs)
          ? parsed.runs.map((r) => ({
              ...r,
              outputs: Array.isArray(r.outputs) ? r.outputs : [],
              importedFileIds: Array.isArray(r.importedFileIds)
                ? r.importedFileIds
                : [],
              // Records predating per-run targets all executed on SaaS.
              target: r.target === "local" ? "local" : "saas",
            }))
          : [],
        dispatched: Array.isArray(parsed.dispatched) ? parsed.dispatched : [],
        waveStartedAt:
          typeof parsed.waveStartedAt === "number" ? parsed.waveStartedAt : 0,
      };
    }
  } catch {
    // Corrupt/unavailable storage — start empty.
  }
  return { runs: [], dispatched: [], waveStartedAt: 0 };
}

let state: RunState = read();
const listeners = new Set<() => void>();

function emit() {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  } catch {
    // Best-effort persistence.
  }
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): RunState {
  return state;
}

const SERVER_SNAPSHOT: RunState = {
  runs: [],
  dispatched: [],
  waveStartedAt: 0,
};
function getServerSnapshot(): RunState {
  return SERVER_SNAPSHOT;
}

/** Non-hook check for background work that should yield while a policy wave is
 *  running (e.g. the sidebar's category backfill) — reads the store without
 *  subscribing, so callers don't re-render on every poll tick. */
export function hasInFlightPolicyRuns(): boolean {
  return state.runs.some(isRunInFlight);
}

/** Key identifying a single (policy, file) run attempt. */
export function dispatchKey(categoryId: string, fileId: string): string {
  return `${categoryId}:${fileId}`;
}

/** Whether this (policy, file) pair has already been dispatched. */
export function isDispatched(categoryId: string, fileId: string): boolean {
  return state.dispatched.includes(dispatchKey(categoryId, fileId));
}

/** Record a newly-dispatched run (marks it dispatched + adds the record). */
export function recordRunStart(record: PolicyRunRecord) {
  const key = dispatchKey(record.categoryId, record.fileId);
  // A run recorded while nothing else is in flight begins a fresh wave, so the
  // progress counts reset to this upload instead of accumulating across every
  // past upload persisted in localStorage.
  const waveStartedAt = state.runs.some(isRunInFlight)
    ? state.waveStartedAt
    : record.startedAt;
  state = {
    runs: capRuns([record, ...state.runs]),
    dispatched: state.dispatched.includes(key)
      ? state.dispatched
      : [...state.dispatched, key],
    waveStartedAt,
  };
  emit();
}

/**
 * Add a run discovered on the backend that this client has no local record of (e.g. it was
 * started before a refresh recorded it). Unlike {@link recordRunStart} this adds no dispatch key:
 * the run already exists server-side, so re-dispatch isn't the concern; we only want it polled and
 * its outputs imported. No-op if the run is already known (reconcile patches those via updateRun).
 */
export function addReconciledRun(record: PolicyRunRecord) {
  if (state.runs.some((r) => r.runId === record.runId)) return;
  state = { ...state, runs: capRuns([record, ...state.runs]) };
  emit();
}

/** Mark a (policy, file) pair dispatched without a run (e.g. dispatch failed). */
export function markDispatched(categoryId: string, fileId: string) {
  const key = dispatchKey(categoryId, fileId);
  if (state.dispatched.includes(key)) return;
  state = { ...state, dispatched: [...state.dispatched, key] };
  emit();
}

/** Patch an in-flight run's status/outputs/error as it progresses. */
export function updateRun(runId: string, patch: Partial<PolicyRunRecord>) {
  let changed = false;
  const runs = state.runs.map((r) => {
    if (r.runId !== runId) return r;
    changed = true;
    return { ...r, ...patch };
  });
  if (!changed) return;
  state = { ...state, runs };
  emit();
}

/** The current record for a run id, if any. */
export function getRun(runId: string): PolicyRunRecord | undefined {
  return state.runs.find((r) => r.runId === runId);
}

/** Drop a run record (leaving its dispatched key intact). Used when retrying a
 *  queue-rejected run in place, so the replacement run doesn't stack a second row. */
export function removeRun(runId: string) {
  if (!state.runs.some((r) => r.runId === runId)) return;
  state = { ...state, runs: state.runs.filter((r) => r.runId !== runId) };
  emit();
}

/** Reset the store — used by tests to isolate it. */
export function resetPolicyRuns() {
  state = { runs: [], dispatched: [], waveStartedAt: 0 };
  emit();
}

export function usePolicyRuns(): PolicyRunRecord[] {
  return useSyncExternalStore(
    subscribe,
    () => getSnapshot().runs,
    () => getServerSnapshot().runs,
  );
}

/** startedAt of the current processing wave (see {@link RunState.waveStartedAt}).
 *  The panel scopes its progress counts to runs at/after this. */
export function usePolicyWaveStart(): number {
  return useSyncExternalStore(
    subscribe,
    () => getSnapshot().waveStartedAt,
    () => getServerSnapshot().waveStartedAt,
  );
}
