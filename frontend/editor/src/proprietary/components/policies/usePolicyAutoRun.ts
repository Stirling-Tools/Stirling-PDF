/**
 * Auto-run controller: every enabled policy enforces on every uploaded
 * file. Watches the session's files and, for each (active policy × not-yet-run
 * file), fires a real backend run (`POST /api/v1/policies/{id}/run`) and polls it
 * to completion, recording progress in {@link policyRunStore} for the activity
 * feed.
 *
 * Headless — call it from {@link PolicyAutoRunController}, which is mounted once
 * wherever the editor is open so enforcement happens regardless of whether the
 * policy panel is on screen. Each (policy, file) pair runs exactly once (tracked
 * in the run store), so re-renders and remounts don't re-fire.
 */

import { useCallback, useEffect, useRef } from "react";
import {
  useAllFiles,
  useFileManagement,
  useFileContext,
} from "@app/contexts/FileContext";
import { fileStorage } from "@app/services/fileStorage";
import { useIndexedDB } from "@app/contexts/IndexedDBContext";
import { POLICIES_ENABLED } from "@app/constants/featureFlags";
import {
  runStoredPolicy,
  getPolicyRun,
  listPolicyRuns,
  downloadPolicyOutput,
} from "@app/services/policyApi";
import type {
  PolicyRunStatus,
  PolicyRunView,
} from "@app/services/policyPipeline";
import { dispatchPaygLimitReached } from "@app/services/usageLimitBridge";
import type { FileId } from "@app/types/file";
import { createStirlingFilesAndStubs } from "@app/services/fileStubHelpers";
import type { StirlingFile, StirlingFileStub } from "@app/types/fileContext";
import type { PoliciesByCategory } from "@app/types/policies";
import { usePolicies } from "@app/hooks/usePolicies";
import {
  addReconciledRun,
  dispatchKey,
  getRun,
  isDispatched,
  markDispatched,
  recordRunStart,
  removeRun,
  updateRun,
  usePolicyRuns,
  type PolicyRunRecord,
} from "@app/components/policies/policyRunStore";

/** Status poll cadence. */
const POLL_MS = 2000;

/** The server aborts any single tool step that runs longer than its internal-API
 *  read timeout, then fails the run — so a run can legitimately stay in flight
 *  for up to this long per step. The client must keep polling at least that long,
 *  or it abandons a run the server is still working on (which reads as a hang). */
const STEP_TIMEOUT_MS = 300_000;

/** Slack on top of the per-step budget: queueing before the first step starts and
 *  output handling after the last one finishes. */
const POLL_GRACE_MS = 30_000;

/** Step count assumed before the first status report reveals the real pipeline
 *  length — only governs the budget for those first couple of polls. */
const DEFAULT_STEP_COUNT = 4;

/** errorCode the backend sets when a run is rejected at admission (job queue full under load).
 *  Transient, not a real processing failure — we back off and retry rather than surfacing it. */
const POLICY_QUEUE_FULL = "POLICY_QUEUE_FULL";

/** Auto-retry budget + exponential backoff for a queue-rejected run, to ride out a busy period
 *  before giving up to a manual retry. Delays are BASE × 2^attempt (≈4s, 8s … 64s, ~2min total). */
const MAX_QUEUE_RETRIES = 5;
const QUEUE_RETRY_BASE_MS = 4000;

/** Consecutive "run not found" responses before giving up. The run state lives
 *  in memory on the server, so a restart or a second instance behind the load
 *  balancer makes a live run's status return 404 — and it won't come back. We
 *  tolerate a brief blip (e.g. a poll racing a just-dispatched run, or one hop
 *  to an instance that hasn't seen it) then fail, rather than polling forever. */
const MAX_NOT_FOUND = 3;

/** A 404 from the run-status endpoint, across the web (axios) and desktop
 *  (tauri http client → {@code code: "ERR_NOT_FOUND"}) builds. */
function isRunNotFound(err: unknown): boolean {
  const e = err as
    | { code?: string; status?: number; response?: { status?: number } }
    | null
    | undefined;
  return (
    e?.code === "ERR_NOT_FOUND" ||
    e?.status === 404 ||
    e?.response?.status === 404
  );
}

/** Mark a run terminal-failed so it stops being polled (and re-polled on reload)
 *  and the activity feed offers Retry, instead of the file enforcing forever. */
function failRun(runId: string, message: string): void {
  updateRun(runId, { status: "FAILED", error: message, errorCode: null });
}

/** How long to wait for an upload's bytes to land in IndexedDB before giving up
 *  (20 × 250ms ≈ 5s). The stub can surface in the file list a beat before its
 *  bytes are committed, so a too-eager fetch would otherwise miss the file. */
const FILE_WAIT_TRIES = 20;
const FILE_WAIT_MS = 250;

function isTerminal(status: PolicyRunStatus): boolean {
  return (
    status === "COMPLETED" || status === "FAILED" || status === "CANCELLED"
  );
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function usePolicyAutoRun(): void {
  const { fileStubs } = useAllFiles();
  const { addFiles } = useFileManagement();
  const { consumeFiles } = useFileContext();
  const { bumpRevision } = useIndexedDB();
  const { policies } = usePolicies();
  const runs = usePolicyRuns();
  // Keys (run ids / dispatch keys) currently in flight, so the effects never
  // double-fire across re-renders while their first async step is pending.
  const polling = useRef<Set<string>>(new Set());
  const importing = useRef<Set<string>>(new Set());
  const dispatching = useRef<Set<string>>(new Set());
  // Reconcile against the backend exactly once per mount.
  const reconciled = useRef(false);

  // A policy's tool calls run server-side, so a usage-limit 402 never reaches the apiClient
  // interceptor (and thus never pops the modal that direct calls get). The backend surfaces the
  // limit sentinel on the run's errorCode; when a run we polled finishes blocked, broadcast a
  // window event. A saas-layer listener (which can read the wallet + open the modal — this
  // proprietary hook can't import the saas modal API) decides free-limit vs spend-cap. Dedupe per
  // run so a folder-watch burst opens the modal once, not once per file.
  const firedLimitModal = useRef<Set<string>>(new Set());

  // Latest policies, read from inside the stable retry callback (which has no deps).
  const policiesRef = useRef(policies);
  policiesRef.current = policies;
  // Per-file (dispatchKey) count of consecutive queue-rejection retries, so backoff escalates and
  // eventually gives up. Survives the run-id changing on each retry; reset on any real outcome.
  const queueRetries = useRef<Map<string, number>>(new Map());

  // A queue-rejected run is just backpressure — drop the rejected record and fire a fresh run in
  // its place after a growing backoff (one feed row, not a new one per attempt). Once the budget is
  // spent, leave the last failure standing so the activity feed offers a manual Retry.
  const scheduleQueueRetry = useCallback((runId: string) => {
    const rec = getRun(runId);
    if (!rec) return;
    // A run rediscovered from the server (reconciled) has no local input fileId, so it can't be
    // re-dispatched; leave it failed rather than spinning on a file we can't resolve.
    if (!rec.fileId) return;
    const key = dispatchKey(rec.categoryId, rec.fileId);
    const attempts = queueRetries.current.get(key) ?? 0;
    const backendId = policiesRef.current[rec.categoryId]?.backendId;
    if (attempts >= MAX_QUEUE_RETRIES || !backendId) {
      queueRetries.current.delete(key);
      return;
    }
    queueRetries.current.set(key, attempts + 1);
    // Soft-label the row as busy through the backoff window (it's still FAILED underneath).
    updateRun(runId, { retrying: true });
    setTimeout(
      () => {
        removeRun(runId);
        void runPolicyOnFile(
          rec.categoryId,
          backendId,
          rec.fileId as FileId,
          rec.fileName,
        );
      },
      QUEUE_RETRY_BASE_MS * 2 ** attempts,
    );
  }, []);

  const onRunFinished = useCallback(
    (view: PolicyRunView) => {
      // Transient admission rejection (queue full): back off and retry instead of failing.
      if (view.errorCode === POLICY_QUEUE_FULL) {
        scheduleQueueRetry(view.runId);
        return;
      }
      // Any genuine terminal outcome clears the file's retry budget so a later run starts fresh.
      const finished = getRun(view.runId);
      if (finished) {
        queueRetries.current.delete(
          dispatchKey(finished.categoryId, finished.fileId),
        );
      }
      const code = view.errorCode;
      if (code !== "PAYG_LIMIT_REACHED" && code !== "FEATURE_DEGRADED") return;
      if (firedLimitModal.current.has(view.runId)) return;
      firedLimitModal.current.add(view.runId);
      dispatchPaygLimitReached(view.errorSubscribed ?? null);
    },
    [scheduleQueueRetry],
  );

  // Dispatch: for each active policy × each session file not yet run, fire a run.
  useEffect(() => {
    if (!POLICIES_ENABLED) return;
    const active = Object.entries(policies).filter(
      ([, s]) =>
        s.configured &&
        s.status === "active" &&
        s.backendId &&
        // Only auto-run on upload when the policy is set to run on upload
        // (export-triggered policies enforce at export time instead).
        (s.runOn ?? "upload") === "upload",
    );
    for (const [categoryId, s] of active) {
      for (const stub of fileStubs) {
        // Input-mode policies enforce only on files that actually entered the
        // system as an upload — not on files a tool/automation produced in-app
        // (versioned edits or independent artifacts like convert/split/merge).
        // Those are enforced only by export-mode policies, at export time.
        if (stub.derivedFromTool) continue;
        const key = dispatchKey(categoryId, stub.id);
        // Skip if already run (persisted) or a dispatch is in flight — the
        // in-memory guard prevents double-firing during the async wait.
        if (isDispatched(categoryId, stub.id) || dispatching.current.has(key)) {
          continue;
        }
        dispatching.current.add(key);
        void runPolicyOnFile(
          categoryId,
          s.backendId as string,
          stub.id,
          stub.name,
        )
          .catch(() => {
            // runPolicyOnFile handles its own failures; this is just a backstop
            // so an unexpected rejection never becomes an unhandled rejection.
          })
          .finally(() => dispatching.current.delete(key));
      }
    }
  }, [fileStubs, policies]);

  // Poll each in-flight run to a terminal state.
  useEffect(() => {
    if (!POLICIES_ENABLED) return;
    for (const run of runs) {
      if (isTerminal(run.status) || polling.current.has(run.runId)) continue;
      polling.current.add(run.runId);
      void poll(run.runId, onRunFinished).finally(() =>
        polling.current.delete(run.runId),
      );
    }
  }, [runs, onRunFinished]);

  // Import each completed run's outputs into the workspace (each output once),
  // so the enforced file appears in the app rather than only on the backend.
  useEffect(() => {
    if (!POLICIES_ENABLED) return;
    for (const run of runs) {
      if (
        run.status !== "COMPLETED" ||
        run.imported ||
        !run.outputs?.length ||
        importing.current.has(run.runId)
      ) {
        continue;
      }
      importing.current.add(run.runId);
      // Honour the policy's output mode: a new file, or a new version of the
      // input file it ran on (needs that input's stub, still in the workspace).
      const outputMode = policies[run.categoryId]?.outputMode ?? "new_version";
      const outputName = policies[run.categoryId]?.outputName ?? "";
      const parentStub = fileStubs.find((s) => (s.id as string) === run.fileId);
      void importOutputs(run, {
        addFiles,
        consumeFiles,
        bumpRevision,
        outputMode,
        outputName,
        parentStub,
      }).finally(() => importing.current.delete(run.runId));
    }
  }, [runs, addFiles, consumeFiles, policies, fileStubs]);

  // Reconcile against the backend on load. The server owns runs (durable, user-scoped),
  // so a run started before this client recorded it, or before a refresh/crash, is
  // rediscovered here; the poll + import effects above then collect its outputs rather
  // than leaving them orphaned. Waits until policies are known so server runs can be
  // attributed to their category.
  useEffect(() => {
    if (!POLICIES_ENABLED || reconciled.current) return;
    if (Object.keys(policies).length === 0) return;
    reconciled.current = true;
    void reconcileServerRuns(policies);
  }, [policies]);
}

interface ImportContext {
  addFiles: (
    files: File[],
    options?: { skipUploadTracking?: boolean },
  ) => Promise<StirlingFile[]>;
  consumeFiles: (
    inputFileIds: FileId[],
    outputs: StirlingFile[],
    stubs: StirlingFileStub[],
  ) => Promise<unknown>;
  /** Bump the IndexedDB revision so the file views re-read after a storage-only version write. */
  bumpRevision: () => void;
  /** "new_file" adds the output as a separate file; "new_version" versions the input. */
  outputMode: "new_file" | "new_version";
  /** Rename rule. Empty → keep the input's filename; set → use the policy's
   *  renamed output (applied server-side per the name-position setting). */
  outputName: string;
  /** The input file's stub — required to version it; absent if it's been removed. */
  parentStub: StirlingFileStub | undefined;
}

/**
 * Pull the caller's server-side runs and fold them into the local store. For a run we already
 * track, patch its status/outputs (preserving local import progress + attribution); for one we
 * don't, adopt it so the poll/import effects pick it up. Server-excluded ad-hoc runs and runs we
 * can't map to a configured category are skipped.
 */
async function reconcileServerRuns(
  policies: PoliciesByCategory,
): Promise<void> {
  let serverRuns;
  try {
    serverRuns = await listPolicyRuns();
  } catch {
    return; // offline / backend down; local cache stands.
  }
  for (const view of serverRuns) {
    // No-ops unless the run is already tracked, so this only patches known runs.
    updateRun(view.runId, {
      status: view.status,
      outputs: view.outputs,
      error: view.error,
    });
    // No-ops if already tracked, so this only adopts runs we'd otherwise have lost.
    const categoryId = categoryForPolicy(view.policyId, policies);
    if (!categoryId) continue;
    addReconciledRun({
      runId: view.runId,
      categoryId,
      // No local input link: a run rediscovered purely from the server (never recorded by this
      // client) can't be tied back to a workspace/storage file, so its output is delivered as a
      // new file rather than a version, and it isn't retried. The recorded-run path (real fileId)
      // covers the common refresh case; this only bites true orphans (storage wipe / other device).
      fileId: "",
      fileName: view.outputs[0]?.fileName ?? "",
      fileSize: 0,
      status: view.status,
      outputs: view.outputs,
      error: view.error,
      // Use the server's creation time, not now, so a rediscovered run shows its real age.
      startedAt: view.createdAt,
    });
  }
}

/** The category whose configured policy produced this run, if any. */
function categoryForPolicy(
  policyId: string | null,
  policies: PoliciesByCategory,
): string | undefined {
  if (!policyId) return undefined;
  return Object.entries(policies).find(
    ([, s]) => s.backendId === policyId,
  )?.[0];
}

/**
 * Fetch a completed run's not-yet-imported output files and deliver them to the
 * workspace. Per-output, via allSettled: each output is tracked once delivered,
 * so a partial failure retries only the missing files on a later tick and the
 * ones that succeeded are never added twice. `imported` flips true only once
 * every output has landed.
 *
 * Delivery honours the policy's output mode: "new_version" replaces the input
 * file with a versioned child (its history chain), "new_file" adds the output
 * as a standalone file. Versioning falls back to a new file if the input is
 * gone (no parent stub).
 */
async function importOutputs(
  run: PolicyRunRecord,
  ctx: ImportContext,
): Promise<void> {
  const done = new Set(run.importedFileIds ?? []);
  const pending = run.outputs.filter((out) => !done.has(out.fileId));
  if (pending.length === 0) {
    updateRun(run.runId, { imported: true });
    return;
  }

  // Keep the input's original filename unless a rename rule is set — without a
  // rule the backend's auto-suffixed name (e.g. "_watermarked_sanitized") would
  // otherwise rename every output.
  const targetName = ctx.outputName
    ? undefined // use the run's per-output (renamed) name below
    : run.fileName;
  const results = await Promise.allSettled(
    pending.map(async (out) => {
      const blob = await downloadPolicyOutput(out.fileId);
      return {
        fileId: out.fileId,
        file: new File([blob], targetName ?? out.fileName ?? run.fileName, {
          type: blob.type || "application/pdf",
        }),
      };
    }),
  );
  const fetched = results
    .filter(
      (r): r is PromiseFulfilledResult<{ fileId: string; file: File }> =>
        r.status === "fulfilled",
    )
    .map((r) => r.value);
  if (fetched.length === 0) return; // all failed — retry the lot on a later tick

  // Deliver, then mark exactly those imported. If delivery throws we don't mark
  // them, so they retry (without having been added).
  const files = fetched.map((f) => f.file);
  // Workspace fileIds of the delivered outputs — the policy badge marks these
  // (the policy's output), not the input it ran on. Set in every branch below.
  let deliveredIds: string[];
  // For new-version output, resolve the input's stub from the active workspace, or from storage
  // when the workspace is empty (e.g. after a reload, where the run is recovered but the input
  // still persists in IndexedDB). Versioning it there keeps the result identical to the no-reload
  // case (one leaf) instead of adding the output as a second file.
  const parentStub =
    ctx.outputMode === "new_version"
      ? (ctx.parentStub ??
        (await fileStorage.getStirlingFileStub(run.fileId as FileId)) ??
        undefined)
      : undefined;
  if (parentStub) {
    // Replace the input file with a versioned child (preserves its history).
    // The version records "automate" as its origin tool — a policy is a
    // multi-tool automation, not any single tool (redact/watermark/sanitize/…).
    const { stirlingFiles, stubs } = await createStirlingFilesAndStubs(
      files,
      parentStub,
      "automate",
    );
    // Mark the outputs handled BEFORE adding them, so the auto-run never enforces
    // the policy on its own output — that would version endlessly in a loop.
    for (const s of stubs) markDispatched(run.categoryId, s.id);
    deliveredIds = stubs.map((s) => s.id as string);
    if (ctx.parentStub) {
      // Input is in the active workspace: version it there (workspace + storage).
      await ctx.consumeFiles([run.fileId as FileId], stirlingFiles, stubs);
    } else {
      // Input is only in storage (run recovered after a reload): version it at the
      // storage layer, then refresh the file views.
      await fileStorage.persistVersionedOutputs(
        [run.fileId as FileId],
        stirlingFiles,
        stubs,
      );
      ctx.bumpRevision();
    }
  } else {
    const added = await ctx.addFiles(files, { skipUploadTracking: true });
    // Same loop-guard for new-file output: the produced file is a new workspace
    // file the auto-run would otherwise re-enforce indefinitely.
    for (const f of added) markDispatched(run.categoryId, f.fileId);
    deliveredIds = added.map((f) => f.fileId as string);
  }
  const importedFileIds = [...done, ...fetched.map((f) => f.fileId)];
  updateRun(run.runId, {
    importedFileIds,
    // Accumulate across partial-import retries rather than overwriting.
    outputFileIds: [...(run.outputFileIds ?? []), ...deliveredIds],
    imported: run.outputs.every((out) => importedFileIds.includes(out.fileId)),
  });
}

/**
 * Resolve the file's bytes, fire a backend run, and record it. Exported so the
 * activity feed's Retry action can re-run a policy on a previously-failed file.
 */
export async function runPolicyOnFile(
  categoryId: string,
  backendId: string,
  fileId: FileId,
  fileName: string,
): Promise<void> {
  // A freshly-uploaded file's bytes are written to IndexedDB asynchronously, so
  // its stub can appear in the file list a beat before getStirlingFile resolves
  // it. Wait briefly rather than bail — and DON'T mark dispatched until we hold
  // the file, or a too-early miss would skip enforcement on that file forever.
  // (The caller's in-flight guard prevents double-dispatch during this wait.)
  // A transient IndexedDB error is treated as a miss (not a throw), so it retries
  // and then marks dispatched rather than rejecting into a hot re-dispatch loop.
  const tryGetFile = async (): Promise<StirlingFile | null> => {
    try {
      return await fileStorage.getStirlingFile(fileId);
    } catch {
      return null;
    }
  };
  let file = await tryGetFile();
  for (let i = 0; i < FILE_WAIT_TRIES && !file; i++) {
    await delay(FILE_WAIT_MS);
    file = await tryGetFile();
  }
  if (!file) {
    // File genuinely gone (removed before it could run) — mark so we don't loop.
    markDispatched(categoryId, fileId);
    return;
  }
  try {
    const runId = await runStoredPolicy(backendId, [file]);
    // recordRunStart marks this (policy, file) dispatched as it records the run.
    recordRunStart({
      runId,
      categoryId,
      fileId,
      fileName,
      fileSize: file.size,
      status: "PENDING",
      outputs: [],
      error: null,
      startedAt: Date.now(),
    });
  } catch {
    // Dispatch failed (offline / backend error). Mark dispatched so we don't hammer;
    // the absent run simply won't appear in the activity feed. If the backend did
    // start a run we never recorded, reconcileServerRuns rediscovers it.
    markDispatched(categoryId, fileId);
  }
}

/**
 * Poll a run's status until it reaches a terminal state (or the budget). Calls {@code onTerminal} once
 * with the final view when it terminates — the caller uses that to pop the usage-limit modal when a
 * run was blocked. Only runs polled this session fire it (terminal runs aren't re-polled), so a
 * persisted failed run never re-triggers a modal on reload.
 */
export async function poll(
  runId: string,
  onTerminal?: (view: PolicyRunView) => void,
): Promise<void> {
  let notFoundStreak = 0;
  // Sized to the server's worst case: each step may run up to STEP_TIMEOUT_MS
  // before the server itself aborts it, so the budget tracks the real pipeline
  // length (learned from the first status report) rather than a flat cap that
  // would quit while a long step is still legitimately running.
  let budgetMs = DEFAULT_STEP_COUNT * STEP_TIMEOUT_MS + POLL_GRACE_MS;
  const startedAt = Date.now();
  while (Date.now() - startedAt < budgetMs) {
    await delay(POLL_MS);
    let view;
    try {
      view = await getPolicyRun(runId);
    } catch (err) {
      // The server lost the run's (in-memory) state — a restart, or a poll that
      // hopped to an instance without it. Tolerate a brief blip, then fail so
      // the file stops enforcing forever; the user can retry.
      if (isRunNotFound(err)) {
        if (++notFoundStreak >= MAX_NOT_FOUND) {
          failRun(runId, "The enforcement run could no longer be found.");
          return;
        }
      } else {
        notFoundStreak = 0; // a non-404 error doesn't confirm the run is gone.
      }
      continue; // keep trying within the budget.
    }
    notFoundStreak = 0;
    if (view.stepCount > 0) {
      budgetMs = view.stepCount * STEP_TIMEOUT_MS + POLL_GRACE_MS;
    }
    updateRun(runId, {
      status: view.status,
      currentStep: view.currentStep,
      stepCount: view.stepCount,
      outputs: view.outputs,
      error: view.error,
      errorCode: view.errorCode ?? null,
    });
    if (isTerminal(view.status)) {
      onTerminal?.(view);
      return;
    }
  }
  // Budget exhausted without a terminal status — stop here and fail it, so the
  // file doesn't enforce forever and reloads don't re-poll it.
  failRun(runId, "Enforcement timed out — the run didn't finish in time.");
}
