/**
 * Headless auto-run controller: one backend run per (policy, file), fired exactly once and polled.
 * Policies sharing a trigger run as an ordered chain so their effects accumulate.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  useAllFiles,
  useFileManagement,
  useFileContext,
} from "@app/contexts/FileContext";
import { fileStorage } from "@app/services/fileStorage";
import { useIndexedDB } from "@app/contexts/IndexedDBContext";
import i18n from "@app/i18n";
import {
  runStoredPolicy,
  getPolicyRun,
  listPolicyRuns,
  downloadPolicyOutput,
  resolvePolicyRunTarget,
} from "@app/services/policyApi";
import type {
  PolicyRunStatus,
  PolicyRunView,
} from "@app/services/policyPipeline";
import { dispatchPaygLimitReached } from "@app/services/usageLimitBridge";
import type { FileId } from "@app/types/file";
import { createStirlingFilesAndStubs } from "@app/services/fileStubHelpers";
import { readClassificationLabelsFromFile } from "@app/services/fileClassification";
import {
  isClassificationCategory,
  POLICY_CATEGORY_IDS,
} from "@app/data/policyCategories";
import {
  acquireDispatchSlot,
  releaseDispatchSlot,
} from "@app/components/policies/dispatchSemaphore";
import type { StirlingFile, StirlingFileStub } from "@app/types/fileContext";
import type { PoliciesByCategory } from "@app/types/policies";
import { usePolicies } from "@app/hooks/usePolicies";
import { useAiEngineEnabled } from "@app/hooks/useAiEngineEnabled";
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

/** First poll fires early so a fresh run shows real progress quickly instead of
 *  sitting on an indeterminate spinner for a full poll interval. */
const FIRST_POLL_MS = 500;

/** Server's per-step abort budget - poll at least this long per step, or we abandon
 *  a run the server is still working on. */
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

/** Consecutive 404s before failing. Run state is in-memory server-side, so a restart
 *  or a hop to another instance loses it permanently - tolerate a blip, not forever. */
const MAX_NOT_FOUND = 3;

/** A 404 (run status gone, or output file gone), across the web (axios) and
 *  desktop (tauri http client → {@code code: "ERR_NOT_FOUND"}) builds. */
function isNotFoundError(err: unknown): boolean {
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

/** Wait for an upload's bytes to land in IndexedDB (~5s): the stub surfaces in the
 *  file list before its bytes are committed, so an eager fetch would miss the file. */
const FILE_WAIT_TRIES = 20;
const FILE_WAIT_MS = 250;

/** A policy that changed nothing completes with no output; left unimported its badge
 *  and blocking overlay spin forever. */
export function finishedWithNothingToDeliver(run: PolicyRunRecord): boolean {
  return (
    run.status === "COMPLETED" &&
    !run.imported &&
    (run.outputs?.length ?? 0) === 0 &&
    // Classification has its own settle path: labels, no output file.
    !isClassificationCategory(run.categoryId)
  );
}

function isTerminal(status: PolicyRunStatus): boolean {
  return (
    status === "COMPLETED" || status === "FAILED" || status === "CANCELLED"
  );
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function usePolicyAutoRun(): void {
  const { fileStubs } = useAllFiles();
  const { addFiles, updateStirlingFileStub } = useFileManagement();
  const { consumeFiles } = useFileContext();
  const { bumpRevision } = useIndexedDB();
  const { policies } = usePolicies();
  const aiEnabled = useAiEngineEnabled();
  const runs = usePolicyRuns();
  // Read in the import effect via ref, not as a dependency: delivery mutates fileStubs,
  // so depending on them would re-fire the effect on its own delivery (infinite cascade).
  const fileStubsRef = useRef(fileStubs);
  fileStubsRef.current = fileStubs;
  // Keys in flight, so effects never double-fire across re-renders while async work pends.
  const polling = useRef<Set<string>>(new Set());
  const importing = useRef<Set<string>>(new Set());
  const dispatching = useRef<Set<string>>(new Set());
  // Reconcile against the backend exactly once per mount.
  const reconciled = useRef(false);

  // Server-side runs never hit the apiClient 402 interceptor, so we broadcast the limit
  // sentinel for a saas listener to open the modal. Deduped per run.
  const firedLimitModal = useRef<Set<string>>(new Set());

  // Active upload policies in chain order, so effects accumulate instead of racing to fork
  // the same version. Mirrors the dispatch filter so the chain honours the same eligibility.
  const orderedUploadCategories = useMemo(
    () =>
      Object.entries(policies)
        .filter(
          ([id, s]) =>
            s.configured &&
            s.status === "active" &&
            s.backendId &&
            // Blank sources means "not yet narrowed" for a catalogue tile, but merely unstamped
            // for a builder pipeline - which must name the editor or it fires on every upload.
            (isCatalogueCategory(id)
              ? !s.sources ||
                s.sources.length === 0 ||
                s.sources.includes("editor")
              : (s.sources?.includes("editor") ?? false)) &&
            (s.runOn ?? "upload") === "upload" &&
            // The server chain only carries the escalation of the local heuristic pass, so with
            // no engine to escalate to there is nothing to do.
            !(id === "classification" && !aiEnabled),
        )
        // Classification runs last: it's non-blocking, so an enforcement policy
        // running after it would fork a new version and drop the user's edits.
        .sort(([idA, a], [idB, b]) => {
          const ca = isClassificationCategory(idA) ? 1 : 0;
          const cb = isClassificationCategory(idB) ? 1 : 0;
          if (ca !== cb) return ca - cb;
          return (a.order ?? 0) - (b.order ?? 0);
        })
        .map(([id]) => id),
    [policies, aiEnabled],
  );

  // Chain-continuations handled this session, so the next policy fires once per run.
  const chained = useRef<Set<string>>(new Set());

  // Latest policies, read from inside the stable retry callback (which has no deps).
  const policiesRef = useRef(policies);
  policiesRef.current = policies;
  // Latest stubs for the chaining effect, which keys off runs and must not depend on stubs.
  const stubsRef = useRef(fileStubs);
  stubsRef.current = fileStubs;
  // Per-file (dispatchKey) count of consecutive queue-rejection retries, so backoff escalates and
  // eventually gives up. Survives the run-id changing on each retry; reset on any real outcome.
  const queueRetries = useRef<Map<string, number>>(new Map());

  // Queue rejection is backpressure: replace the record with a fresh run after a backoff, so the
  // feed keeps one row. Budget spent, leave the failure standing for a manual Retry.
  const scheduleQueueRetry = useCallback((runId: string) => {
    const rec = getRun(runId);
    if (!rec) return;
    // A reconciled run has no local fileId to re-dispatch; leave it failed.
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

  // Fire only the FIRST upload policy per file; the chaining effect below runs the rest
  // on each previous output, so policies apply cumulatively in order.
  useEffect(() => {
    const firstCategory = orderedUploadCategories[0];
    if (!firstCategory) return;
    const backendId = policies[firstCategory]?.backendId;
    if (!backendId) return;
    for (const stub of fileStubs) {
      // Input-mode policies cover uploads only; tool-produced files are left to
      // export-mode policies at export time.
      if (stub.derivedFromTool) continue;
      const key = dispatchKey(firstCategory, stub.id);
      // Skip if already run (persisted) or in flight - the in-memory guard covers the async wait.
      if (
        isDispatched(firstCategory, stub.id) ||
        dispatching.current.has(key)
      ) {
        continue;
      }
      // A confident local verdict stands; only an unsure one is escalated to the engine.
      if (!shouldDispatchToAi(firstCategory, stub)) continue;
      dispatching.current.add(key);
      void runPolicyOnFile(firstCategory, backendId, stub.id, stub.name)
        .catch(() => {
          // Backstop: runPolicyOnFile handles its own failures.
        })
        .finally(() => dispatching.current.delete(key));
    }
  }, [fileStubs, policies, orderedUploadCategories]);

  // Once a run's output lands, fire the next upload policy on it - success only, once per
  // run. isDispatched guards re-dispatch across reloads.
  useEffect(() => {
    for (const run of runs) {
      if (run.status !== "COMPLETED" || !run.imported) continue;
      if (chained.current.has(run.runId)) continue;
      const nextCategory = nextUploadCategory(
        orderedUploadCategories,
        run.categoryId,
      );
      const outputIds = run.outputFileIds ?? [];
      if (!nextCategory || outputIds.length === 0) {
        // End of the chain (or nothing to chain onto): don't revisit this run.
        chained.current.add(run.runId);
        continue;
      }
      const backendId = policies[nextCategory]?.backendId;
      // Next policy not ready yet (still reconciling) — retry when policies change.
      if (!backendId) continue;
      chained.current.add(run.runId);
      // Chain onto EVERY output: a run that produced several files (split, ZIP-unpacked)
      // would otherwise silently skip the next policy on outputs 2..N.
      for (const outputId of outputIds) {
        if (isDispatched(nextCategory, outputId as FileId)) continue;
        const outputStub = stubsRef.current.find((s) => s.id === outputId);
        // Not yet classified locally: defer, as this effect re-runs when the verdict lands.
        if (outputStub && !shouldDispatchToAi(nextCategory, outputStub))
          continue;
        void runPolicyOnFile(
          nextCategory,
          backendId,
          outputId as FileId,
          run.fileName,
          true, // chained → jump the dispatch queue ahead of new files
        ).catch(() => {});
      }
    }
  }, [runs, policies, orderedUploadCategories, fileStubs]);

  // Poll each in-flight run to a terminal state.
  useEffect(() => {
    for (const run of runs) {
      if (isTerminal(run.status) || polling.current.has(run.runId)) continue;
      polling.current.add(run.runId);
      void poll(run.runId, onRunFinished).finally(() =>
        polling.current.delete(run.runId),
      );
    }
  }, [runs, onRunFinished]);

  // Import each completed run's outputs once, so the enforced file appears in the app.
  useEffect(() => {
    for (const run of runs) {
      const classification = isClassificationCategory(run.categoryId);
      if (
        run.status !== "COMPLETED" ||
        run.imported ||
        importing.current.has(run.runId)
      ) {
        continue;
      }
      if (finishedWithNothingToDeliver(run)) {
        updateRun(run.runId, { imported: true });
        continue;
      }
      importing.current.add(run.runId);
      // Classification is metadata-only: labels onto the current leaf, no version fork.
      if (classification) {
        // Resolved at write time, not snapshotted: a tool run during the async parse can fork
        // a new leaf, and a stale id would no-op and lose the labels.
        void importClassificationLabels(
          run,
          () =>
            classificationLabelTargetStubs(run.fileId, fileStubsRef.current),
          { updateStirlingFileStub, bumpRevision },
        ).finally(() => importing.current.delete(run.runId));
        continue;
      }
      // Output mode: a new file, or a new version of the input (needs its stub in the workspace).
      const outputMode = policies[run.categoryId]?.outputMode ?? "new_version";
      const outputName = policies[run.categoryId]?.outputName ?? "";
      const outputNamePosition = policies[run.categoryId]?.outputNamePosition;
      const parentStub = fileStubsRef.current.find(
        (s) => (s.id as string) === run.fileId,
      );
      void importOutputs(run, {
        addFiles,
        consumeFiles,
        updateStirlingFileStub,
        bumpRevision,
        outputMode,
        outputName,
        outputNamePosition,
        parentStub,
        firstUploadCategory: orderedUploadCategories[0],
      }).finally(() => importing.current.delete(run.runId));
    }
    // NB: fileStubs is read via a ref, not a dependency, so a delivery's own workspace
    // mutation can't re-trigger this effect.
  }, [
    runs,
    addFiles,
    consumeFiles,
    updateStirlingFileStub,
    policies,
    orderedUploadCategories,
  ]);

  // The server owns runs, so rediscover any this client never recorded and let the effects
  // above collect their outputs. Waits for policies so runs can be attributed to a category.
  useEffect(() => {
    if (reconciled.current) return;
    if (Object.keys(policies).length === 0) return;
    reconciled.current = true;
    void reconcileServerRuns(policies);
  }, [policies]);
}

interface ImportContext {
  addFiles: (
    files: File[],
    options?: { skipUploadTracking?: boolean; derivedFromTool?: boolean },
  ) => Promise<StirlingFile[]>;
  consumeFiles: (
    inputFileIds: FileId[],
    outputs: StirlingFile[],
    stubs: StirlingFileStub[],
    options?: { silent?: boolean },
  ) => Promise<unknown>;
  /** Patch a workspace stub in place (used to stamp a new-file output's category). */
  updateStirlingFileStub: (
    fileId: FileId,
    updates: Partial<StirlingFileStub>,
  ) => void;
  /** Bump the IndexedDB revision so the file views re-read after a storage-only version write. */
  bumpRevision: () => void;
  /** "new_file" adds the output as a separate file; "new_version" versions the input. */
  outputMode: "new_file" | "new_version";
  /** Rename rule. Empty → keep the input's filename. */
  outputName: string;
  /** Rename position around the base filename; defaults to "suffix" when absent. */
  outputNamePosition?: "prefix" | "suffix" | "auto-number";
  /** The input file's stub — required to version it; absent if it's been removed. */
  parentStub: StirlingFileStub | undefined;
  /** The only policy the dispatch effect fires; every output is marked dispatched for it
   *  so a downstream output is never mistaken for a fresh upload and re-enforced. */
  firstUploadCategory: string | undefined;
}

/**
 * Fold server-side runs into the local store: patch tracked ones, adopt untracked ones for feed
 * visibility only. Unmappable and ad-hoc runs are skipped.
 */
function applyOutputName(
  inputFileName: string,
  outputName: string,
  position: "prefix" | "suffix" | "auto-number",
): string {
  const dot = inputFileName.lastIndexOf(".");
  const base = dot > 0 ? inputFileName.slice(0, dot) : inputFileName;
  const ext = dot > 0 ? inputFileName.slice(dot) : "";
  // auto-number needs dedup state not available here, so it falls back to suffix.
  return position === "prefix"
    ? `${outputName}_${base}${ext}`
    : `${base}_${outputName}${ext}`;
}

/** Next upload policy in the chain, or undefined if last or no longer eligible. */
function nextUploadCategory(
  orderedUploadCategories: string[],
  categoryId: string,
): string | undefined {
  const index = orderedUploadCategories.indexOf(categoryId);
  if (index < 0) return undefined;
  return orderedUploadCategories[index + 1];
}

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
      // Server-only run: never recorded here, so it can't be tied to a file (and isn't retried).
      fileId: "",
      fileName: view.outputs[0]?.fileName ?? "",
      fileSize: 0,
      // From the SaaS run registry, so its outputs live on the cloud backend.
      target: "saas",
      status: view.status,
      outputs: view.outputs,
      error: view.error,
      // Adopted for feed visibility ONLY, never delivery: else a completed run evicted from the capped store gets re-adopted every refresh and re-delivered as a new file (no fileId → no parent), opening phantom duplicates forever. Client-recorded runs (real fileId) still deliver.
      imported: true,
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

interface ClassificationImportContext {
  updateStirlingFileStub: (
    fileId: FileId,
    updates: Partial<StirlingFileStub>,
  ) => void;
  bumpRevision: () => void;
}

/** The run's file plus live descendants, so an edit during the run (which forks a new leaf)
 *  still shows the tags. Empty once the document has left the workspace. */
export function classificationLabelTargetStubs(
  runFileId: string,
  stubs: ReadonlyArray<StirlingFileStub>,
): StirlingFileStub[] {
  return stubs.filter(
    (s) =>
      (s.id as string) === runFileId ||
      s.parentFileId === runFileId ||
      s.sourceFileIds?.includes(runFileId as FileId),
  );
}

/** Label-read attempts and backoff. Retried HERE because the import effect only re-runs on
 *  run-store changes, so bailing out would leave the file's "running" pill spinning. */
const LABEL_READ_ATTEMPTS = 3;
const LABEL_READ_RETRY_MS = 2000;

/**
 * Read labels from a completed run's output PDF: a 404 means it aged out and is skipped, other
 * failures retry with backoff. Null means no labels to apply, so the caller settles the run.
 */
async function readRunLabels(run: PolicyRunRecord): Promise<string[] | null> {
  for (let attempt = 0; attempt < LABEL_READ_ATTEMPTS; attempt++) {
    if (attempt > 0) await delay(LABEL_READ_RETRY_MS * attempt);
    let transientFailure = false;
    for (const out of run.outputs) {
      try {
        const blob = await downloadPolicyOutput(out.fileId, run.target);
        const file = new File([blob], out.fileName ?? run.fileName, {
          type: blob.type || "application/pdf",
        });
        const labels = await readClassificationLabelsFromFile(file);
        if (labels && labels.length > 0) return labels;
      } catch (err) {
        if (!isNotFoundError(err)) transientFailure = true;
      }
    }
    // Every output was read (or had aged out): there are no labels to apply.
    if (!transientFailure) return null;
  }
  // Out of attempts: settle unlabelled rather than spin forever - the badge stays, tags don't.
  return null;
}

/**
 * Stamp `labels` in place (workspace + storage) - tags only, no versioned child. Two passes
 * because a consume racing the first would strand its target and lose the labels.
 */
async function stampClassificationLabels(
  labels: string[],
  resolveTargets: () => StirlingFileStub[],
  ctx: ClassificationImportContext,
): Promise<FileId[]> {
  const updates = { classificationLabels: labels };
  const tagged = new Set<FileId>();

  for (let pass = 0; pass < 2; pass++) {
    // Resolve and stamp synchronously so no consume lands in between; a consume after the
    // stamp is safe, as the reducer carries the labels onto the new leaf.
    const fresh = resolveTargets().filter((s) => !tagged.has(s.id));
    for (const stub of fresh) {
      tagged.add(stub.id);
      ctx.updateStirlingFileStub(stub.id, updates);
    }

    let mutated = false;
    for (const stub of fresh) {
      if (await fileStorage.updateFileMetadata(stub.id, updates))
        mutated = true;
    }
    if (mutated) ctx.bumpRevision();

    // Yield a macrotask so React processes this pass's stamps before the next re-resolves.
    if (pass === 0) await new Promise((resolve) => setTimeout(resolve));
  }
  return Array.from(tagged);
}

/** Deliver a classification run: read its labels and tag the live document. Nothing is versioned. */
async function importClassificationLabels(
  run: PolicyRunRecord,
  resolveTargets: () => StirlingFileStub[],
  ctx: ClassificationImportContext,
): Promise<void> {
  if (resolveTargets().length === 0) {
    // The document left the workspace - nothing to tag.
    updateRun(run.runId, { imported: true });
    return;
  }
  const labels = await readRunLabels(run);
  const targetIds =
    labels && labels.length > 0
      ? await stampClassificationLabels(labels, resolveTargets, ctx)
      : [];
  // Settle either way so it stops re-importing. outputFileIds are the TAGGED files, so their
  // badge persists; safe to chain-key on, as classification is always last.
  updateRun(run.runId, {
    imported: true,
    importedFileIds: run.outputs.map((o) => o.fileId),
    outputFileIds: targetIds,
  });
}

/**
 * Deliver a run's outputs per-output, so a partial failure retries only the missing files and
 * successes are never added twice. Honours the output mode; versioning needs the parent stub.
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

  // Keep the input's filename unless a rename rule is set, else the backend's auto-suffixed
  // name renames every output.
  const targetName = ctx.outputName
    ? applyOutputName(
        run.fileName,
        ctx.outputName,
        ctx.outputNamePosition ?? "suffix",
      )
    : run.fileName;
  const settled = await Promise.allSettled(
    pending.map(async (out) => {
      const blob = await downloadPolicyOutput(out.fileId, run.target);
      return {
        fileId: out.fileId,
        file: new File([blob], targetName ?? out.fileName ?? run.fileName, {
          type: blob.type || "application/pdf",
        }),
      };
    }),
  );
  const fetched = settled
    .filter(
      (r): r is PromiseFulfilledResult<{ fileId: string; file: File }> =>
        r.status === "fulfilled",
    )
    .map((r) => r.value);
  // A 404 means the backend no longer has that output (past its retention
  // window); retrying it can never succeed, so don't loop on it forever. Any
  // other rejection is transient and worth retrying on a later tick.
  const rejections = settled
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => r.reason);
  const allFailuresPermanent =
    rejections.length > 0 && rejections.every(isNotFoundError);

  if (fetched.length === 0) {
    if (allFailuresPermanent) {
      failRun(
        run.runId,
        i18n.t(
          "policies.activity.outputsUnavailable",
          "Policy outputs are no longer available to download.",
        ),
      );
    }
    return; // transient/mixed: retry the lot later; permanent: already failed.
  }

  // Mark a delivered output as already-handled so the auto-run never re-enforces
  // a policy on its own output. Covers the producing policy AND the first upload
  // policy (the only one the dispatch effect fires) — without the latter, a
  // downstream policy's output looks like a fresh upload and the first policy
  // re-runs on it, versioning/duplicating endlessly. Forward chaining is
  // unaffected: it only ever fires categories AFTER the producer, never the first.
  const markHandled = (id: string) => {
    markDispatched(run.categoryId, id);
    if (ctx.firstUploadCategory && ctx.firstUploadCategory !== run.categoryId) {
      markDispatched(ctx.firstUploadCategory, id);
    }
  };

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

  // Resolve each output's classification labels and put them ON the stub, so
  // they ride through consume/persist to BOTH the workspace and storage — and
  // every later version inherits them (createChildStub + the CONSUME_FILES
  // reducer). This keeps files in their label groups instead of flashing into
  // "Other" and waiting on a PDF re-read when a 2nd policy or a tool runs.
  // Prefer the input's carried-forward labels (cheap) and only read the
  // freshly-labelled file when there's nothing to inherit (the classification
  // origin) — so a 60-file batch doesn't re-read every downstream output.
  const parentLabels = parentStub?.classificationLabels;
  const resolveLabels = async (file: File) =>
    (parentLabels && parentLabels.length > 0 ? parentLabels : undefined) ??
    (await readClassificationLabelsFromFile(file)) ??
    undefined;

  if (parentStub) {
    // Replace the input file with a versioned child (preserves its history).
    // The version records "automate" as its origin tool — a policy is a
    // multi-tool automation, not any single tool (redact/watermark/sanitize/…).
    const { stirlingFiles, stubs } = await createStirlingFilesAndStubs(
      files,
      parentStub,
      "automate",
    );
    // Transitive provenance for the PERSISTED record, mirroring what the
    // CONSUME_FILES reducer computes for workspace state: the output derives
    // from its input plus everything that input derived from. Without this the
    // stored lineage misses intermediate hops, and a closed file's policy
    // badges can't resolve past the most recent run in a 3+-policy chain.
    const lineage = Array.from(
      new Set([run.fileId as FileId, ...(parentStub.sourceFileIds ?? [])]),
    );
    // Stamp each output stub with: the resolved labels (createChildStub already
    // inherited the parent's; this also captures the classification origin,
    // where the parent had none but the labelled file does), the transitive
    // lineage, and derivedFromTool — the durable cross-session guard that stops
    // the auto-run ever re-enforcing a policy on its own output (survives a
    // localStorage wipe / a different device, unlike the dispatched markers).
    const categorized = await Promise.all(
      stubs.map(async (s, i) => {
        const labels = await resolveLabels(files[i]);
        return {
          ...s,
          sourceFileIds: lineage,
          derivedFromTool: true,
          ...(labels ? { classificationLabels: labels } : {}),
        };
      }),
    );
    // Mark the outputs handled BEFORE adding them (belt-and-suspenders session
    // guard on top of derivedFromTool) so the auto-run never enforces the policy
    // on its own output — that would version endlessly in a loop.
    for (const s of categorized) markHandled(s.id as string);
    deliveredIds = categorized.map((s) => s.id as string);
    if (ctx.parentStub) {
      // Input is in the active workspace: version it in place, silently — the
      // output replaces the input in the same slot without being auto-selected,
      // reordered to the top, or opened in the viewer. The category rides on the
      // stub, so it lands in the right group instantly (no re-read, no flicker).
      await ctx.consumeFiles(
        [run.fileId as FileId],
        stirlingFiles,
        categorized,
        { silent: true },
      );
    } else {
      // Input is only in storage (run recovered after a reload): version it at the
      // storage layer, then refresh the file views.
      await fileStorage.persistVersionedOutputs(
        [run.fileId as FileId],
        stirlingFiles,
        categorized,
      );
      ctx.bumpRevision();
    }
  } else {
    // derivedFromTool prevents the auto-run from ever re-enforcing this output,
    // even if the dispatched list is cleared (localStorage wipe / different device).
    const added = await ctx.addFiles(files, {
      skipUploadTracking: true,
      derivedFromTool: true,
    });
    // Belt-and-suspenders session guard on top of derivedFromTool.
    for (const f of added) markHandled(f.fileId as string);
    deliveredIds = added.map((f) => f.fileId as string);
    // Mark each new-file output as tool-derived (the versioned path gets this from the
    // CONSUME_FILES reducer; the addFiles path doesn't). This is the real loop guard: the dispatch
    // effect skips `derivedFromTool` files, so a policy output is never re-enforced as a fresh
    // upload regardless of how upload policies are later reordered — unlike per-(category,file)
    // markers keyed to whichever policy is currently first. Also stamp labels so it lands in the
    // right sidebar group immediately (a new file has no parent to inherit from).
    let mutated = false;
    await Promise.all(
      added.map(async (f, i) => {
        const labels = await resolveLabels(files[i]);
        const updates = {
          derivedFromTool: true,
          ...(labels ? { classificationLabels: labels } : {}),
        };
        ctx.updateStirlingFileStub(f.fileId, updates);
        const ok = await fileStorage.updateFileMetadata(f.fileId, updates);
        if (ok) mutated = true;
      }),
    );
    if (mutated) ctx.bumpRevision();
  }
  const importedFileIds = [...done, ...fetched.map((f) => f.fileId)];
  const imported = run.outputs.every((out) =>
    importedFileIds.includes(out.fileId),
  );
  updateRun(run.runId, {
    importedFileIds,
    // Accumulate across partial-import retries rather than overwriting.
    outputFileIds: [...(run.outputFileIds ?? []), ...deliveredIds],
    imported,
  });
  // Some outputs landed but the rest are permanently gone (404): finalize so the
  // run stops re-fetching the missing ones on every tick.
  if (!imported && allFailuresPermanent) {
    failRun(
      run.runId,
      i18n.t(
        "policies.activity.partialOutputsUnavailable",
        "Some policy outputs are no longer available to download.",
      ),
    );
  }
}

/**
 * Whether this key is one of the catalogue's category tiles rather than a bare pipeline id.
 *
 * <p>The two are keyed into the same map (see fetchPoliciesByCategory) but carry different
 * metadata: a tile always stamps its own, a builder pipeline stamps none, so defaults that are
 * right for one are wrong for the other.
 */
function isCatalogueCategory(key: string): boolean {
  return POLICY_CATEGORY_IDS.has(key);
}

/**
 * The one heuristic verdict trusted to stand on its own.
 *
 * <p>The local heuristic runs on every editor upload, but only a high-confidence answer settles the
 * matter; anything less is escalated to the AI classifier, which overwrites it. Deliberately strict:
 * a wrong label is worse than the cost of an engine call.
 */
const TRUSTED_CONFIDENCE = "high";

/**
 * Whether the AI classifier should be asked about this file.
 *
 * <p>Only for the Classification category, and only once the heuristic has actually reported: a
 * stub with no confidence yet has not been classified locally, and dispatching then would race the
 * first pass and bill for an answer it was about to produce for free.
 *
 * <p>TODO: a pipeline that merely CONTAINS a classify step (built on the Pipelines page, so it has
 * no category) is not covered - it runs the step on the backend unconditionally, with no local pass
 * first. Extending the rule to it needs per-step suppression inside a run, which the executor
 * cannot express today: the heuristic would have to satisfy one step of a chain while the rest
 * still run. Deliberately deferred rather than half-built.
 */
export function shouldDispatchToAi(
  categoryId: string,
  stub: StirlingFileStub,
): boolean {
  if (!isClassificationCategory(categoryId)) {
    return true;
  }
  const confidence = stub.classificationConfidence;
  return confidence != null && confidence !== TRUSTED_CONFIDENCE;
}

/** Resolve the file's bytes, fire a backend run, and record it. */
async function runPolicyOnFile(
  categoryId: string,
  backendId: string,
  fileId: FileId,
  fileName: string,
  // Chained (downstream) dispatch — jumps the dispatch queue so a file mid-chain
  // finishes its flow before new files start (see acquireDispatchSlot).
  priority = false,
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
  // Bounded upload window — see MAX_CONCURRENT_DISPATCHES. Only the POST is
  // gated; the IDB wait above never holds a slot.
  await acquireDispatchSlot(priority);
  try {
    const target = resolvePolicyRunTarget();
    const runId = await runStoredPolicy(backendId, [file]);
    // recordRunStart marks this (policy, file) dispatched as it records the run.
    recordRunStart({
      runId,
      categoryId,
      fileId,
      fileName,
      fileSize: file.size,
      target,
      status: "PENDING",
      outputs: [],
      error: null,
      startedAt: Date.now(),
    });
  } catch (err) {
    // Dispatch failed (e.g. policy deleted/404 or backend offline). Mark dispatched so we don't hammer;
    // the absent run simply won't appear in the activity feed. If the backend did
    // start a run we never recorded, reconcileServerRuns rediscovers it.
    console.debug(
      `[PolicyAutoRun] Failed to dispatch policy ${categoryId} (${backendId}):`,
      err,
    );
    markDispatched(categoryId, fileId);
  } finally {
    releaseDispatchSlot();
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
  let nextDelayMs = FIRST_POLL_MS;
  while (Date.now() - startedAt < budgetMs) {
    await delay(nextDelayMs);
    nextDelayMs = POLL_MS;
    let view;
    try {
      view = await getPolicyRun(runId);
    } catch (err) {
      // The server lost the run's (in-memory) state — a restart, or a poll that
      // hopped to an instance without it. Tolerate a brief blip, then fail so
      // the file stops enforcing forever; the user can retry.
      if (isNotFoundError(err)) {
        if (++notFoundStreak >= MAX_NOT_FOUND) {
          failRun(
            runId,
            i18n.t(
              "policies.activity.runNotFound",
              "The enforcement run could no longer be found.",
            ),
          );
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
  failRun(
    runId,
    i18n.t(
      "policies.activity.timedOut",
      "Enforcement timed out before the run could finish.",
    ),
  );
}
