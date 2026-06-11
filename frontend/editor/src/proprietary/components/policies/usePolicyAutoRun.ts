/**
 * Auto-run controller (Phase B): every enabled policy enforces on every uploaded
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
import { POLICIES_ENABLED } from "@app/constants/featureFlags";
import {
  runStoredPolicy,
  getPolicyRun,
  downloadPolicyOutput,
} from "@app/services/policyApi";
import type {
  PolicyRunStatus,
  PolicyRunView,
  PolicyLimitReachedDetail,
} from "@app/services/policyPipeline";
import { POLICY_LIMIT_REACHED_EVENT } from "@app/services/policyPipeline";
import type { FileId } from "@app/types/file";
import { createStirlingFilesAndStubs } from "@app/services/fileStubHelpers";
import type { StirlingFile, StirlingFileStub } from "@app/types/fileContext";
import { usePolicies } from "@app/hooks/usePolicies";
import {
  dispatchKey,
  isDispatched,
  markDispatched,
  recordRunStart,
  updateRun,
  usePolicyRuns,
  type PolicyRunRecord,
} from "@app/components/policies/policyRunStore";

/** Poll cadence + cap for a single run's status (≈2.5 min worst case). */
const POLL_MS = 2000;
const MAX_POLLS = 75;

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
  const { policies } = usePolicies();
  const runs = usePolicyRuns();
  // Keys (run ids / dispatch keys) currently in flight, so the effects never
  // double-fire across re-renders while their first async step is pending.
  const polling = useRef<Set<string>>(new Set());
  const importing = useRef<Set<string>>(new Set());
  const dispatching = useRef<Set<string>>(new Set());

  // A policy's tool calls run server-side, so a usage-limit 402 never reaches the apiClient
  // interceptor (and thus never pops the modal that direct calls get). The backend surfaces the
  // limit sentinel on the run's errorCode; when a run we polled finishes blocked, broadcast a
  // window event. A saas-layer listener (which can read the wallet + open the modal — this
  // proprietary hook can't import the saas modal API) decides free-limit vs spend-cap. Dedupe per
  // run so a folder-watch burst opens the modal once, not once per file.
  const firedLimitModal = useRef<Set<string>>(new Set());

  const onRunFinished = useCallback((view: PolicyRunView) => {
    const code = view.errorCode;
    if (code !== "PAYG_LIMIT_REACHED" && code !== "FEATURE_DEGRADED") return;
    if (firedLimitModal.current.has(view.runId)) return;
    firedLimitModal.current.add(view.runId);
    try {
      window.dispatchEvent(
        new CustomEvent<PolicyLimitReachedDetail>(POLICY_LIMIT_REACHED_EVENT, {
          detail: { subscribed: view.errorSubscribed ?? null },
        }),
      );
    } catch {
      // non-browser env (tests / SSR) — no-op.
    }
  }, []);

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
        outputMode,
        outputName,
        parentStub,
      }).finally(() => importing.current.delete(run.runId));
    }
  }, [runs, addFiles, consumeFiles, policies, fileStubs]);
}

interface ImportContext {
  addFiles: (files: File[]) => Promise<StirlingFile[]>;
  consumeFiles: (
    inputFileIds: FileId[],
    outputs: StirlingFile[],
    stubs: StirlingFileStub[],
  ) => Promise<unknown>;
  /** "new_file" adds the output as a separate file; "new_version" versions the input. */
  outputMode: "new_file" | "new_version";
  /** Rename rule. Empty → keep the input's filename; set → use the policy's
   *  renamed output (applied server-side per the name-position setting). */
  outputName: string;
  /** The input file's stub — required to version it; absent if it's been removed. */
  parentStub: StirlingFileStub | undefined;
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
  // (the policy's output), not the input it ran on. Set in both branches below.
  let deliveredIds: string[];
  if (ctx.outputMode === "new_version" && ctx.parentStub) {
    // Replace the input file with a versioned child (preserves its history).
    // The version records "automate" as its origin tool — a policy is a
    // multi-tool automation, not any single tool (redact/watermark/sanitize/…).
    const { stirlingFiles, stubs } = await createStirlingFilesAndStubs(
      files,
      ctx.parentStub,
      "automate",
    );
    // Mark the outputs handled BEFORE adding them, so the auto-run never enforces
    // the policy on its own output — that would version endlessly in a loop.
    for (const s of stubs) markDispatched(run.categoryId, s.id);
    deliveredIds = stubs.map((s) => s.id as string);
    await ctx.consumeFiles([run.fileId as FileId], stirlingFiles, stubs);
  } else {
    const added = await ctx.addFiles(files);
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
    // Dispatch failed (offline / backend error). Mark dispatched so we don't
    // hammer; the absent run simply won't appear in the activity feed.
    markDispatched(categoryId, fileId);
  }
}

/**
 * Poll a run's status until it reaches a terminal state (or the cap). Calls {@code onTerminal} once
 * with the final view when it terminates — the caller uses that to pop the usage-limit modal when a
 * run was blocked. Only runs polled this session fire it (terminal runs aren't re-polled), so a
 * persisted failed run never re-triggers a modal on reload.
 */
async function poll(
  runId: string,
  onTerminal?: (view: PolicyRunView) => void,
): Promise<void> {
  for (let i = 0; i < MAX_POLLS; i++) {
    await delay(POLL_MS);
    let view;
    try {
      view = await getPolicyRun(runId);
    } catch {
      continue; // transient — keep trying within the cap.
    }
    updateRun(runId, {
      status: view.status,
      outputs: view.outputs,
      error: view.error,
      errorCode: view.errorCode ?? null,
    });
    if (isTerminal(view.status)) {
      onTerminal?.(view);
      return;
    }
  }
}
