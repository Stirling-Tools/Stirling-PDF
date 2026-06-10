/**
 * External store for real backend policy runs (Phase B: auto-run on upload).
 *
 * The auto-run controller fires a backend run for each enabled policy × each
 * newly-uploaded file and records it here; the detail view's activity feed reads
 * from it. `dispatched` keys (`categoryId:fileId`) ensure a given file is only
 * ever run once per policy, surviving remounts via localStorage.
 *
 * Read with {@code useSyncExternalStore}; mutated by the controller.
 */

import { useSyncExternalStore } from "react";
import type { PolicyRunStatus } from "@app/services/policyPipeline";

export interface PolicyRunRecord {
  runId: string;
  categoryId: string;
  fileId: string;
  fileName: string;
  fileSize: number;
  status: PolicyRunStatus;
  /** Output files (downloadable via /api/v1/general/files/{id}) once done. */
  outputs: { fileId: string; fileName: string }[];
  /** True once ALL outputs have been imported into the workspace. */
  imported?: boolean;
  /** Output fileIds already imported — tracked per-file so a partial failure
   *  retries only the missing ones and never re-adds the ones that succeeded. */
  importedFileIds?: string[];
  error: string | null;
  /** Epoch ms when the run was dispatched. */
  startedAt: number;
}

interface RunState {
  runs: PolicyRunRecord[];
  dispatched: string[];
}

const STORAGE_KEY = "stirling-policy-runs";
/** Cap stored runs so the activity log can't grow without bound. */
const MAX_RUNS = 50;

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
            }))
          : [],
        dispatched: Array.isArray(parsed.dispatched) ? parsed.dispatched : [],
      };
    }
  } catch {
    // Corrupt/unavailable storage — start empty.
  }
  return { runs: [], dispatched: [] };
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

const SERVER_SNAPSHOT: RunState = { runs: [], dispatched: [] };
function getServerSnapshot(): RunState {
  return SERVER_SNAPSHOT;
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
  state = {
    runs: [record, ...state.runs].slice(0, MAX_RUNS),
    dispatched: state.dispatched.includes(key)
      ? state.dispatched
      : [...state.dispatched, key],
  };
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

/** Reset the store — used by tests to isolate it. */
export function resetPolicyRuns() {
  state = { runs: [], dispatched: [] };
  emit();
}

export function usePolicyRuns(): PolicyRunRecord[] {
  return useSyncExternalStore(
    subscribe,
    () => getSnapshot().runs,
    () => getServerSnapshot().runs,
  );
}
