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

import { useEffect, useRef } from "react";
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
import type { PolicyRunStatus } from "@app/services/policyPipeline";
import type { FileId } from "@app/types/file";
import { createStirlingFilesAndStubs } from "@app/services/fileStubHelpers";
import type { StirlingFile, StirlingFileStub } from "@app/types/fileContext";
import { usePolicies } from "@app/hooks/usePolicies";
import {
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
  // Run ids currently being polled / imported, so the effects never double-fire.
  const polling = useRef<Set<string>>(new Set());
  const importing = useRef<Set<string>>(new Set());

  // Dispatch: for each active policy × each session file not yet run, fire a run.
  useEffect(() => {
    if (!POLICIES_ENABLED) return;
    const active = Object.entries(policies).filter(
      ([, s]) => s.configured && s.status === "active" && s.backendId,
    );
    for (const [categoryId, s] of active) {
      for (const stub of fileStubs) {
        if (isDispatched(categoryId, stub.id)) continue;
        // runPolicyOnFile marks dispatched synchronously before its first await.
        void runPolicyOnFile(
          categoryId,
          s.backendId as string,
          stub.id,
          stub.name,
        );
      }
    }
  }, [fileStubs, policies]);

  // Poll each in-flight run to a terminal state.
  useEffect(() => {
    if (!POLICIES_ENABLED) return;
    for (const run of runs) {
      if (isTerminal(run.status) || polling.current.has(run.runId)) continue;
      polling.current.add(run.runId);
      void poll(run.runId).finally(() => polling.current.delete(run.runId));
    }
  }, [runs]);

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
      const outputMode = policies[run.categoryId]?.outputMode ?? "new_file";
      const parentStub = fileStubs.find((s) => (s.id as string) === run.fileId);
      void importOutputs(run, {
        addFiles,
        consumeFiles,
        outputMode,
        parentStub,
      }).finally(() => importing.current.delete(run.runId));
    }
  }, [runs, addFiles, consumeFiles, policies, fileStubs]);
}

interface ImportContext {
  addFiles: (files: File[]) => Promise<unknown>;
  consumeFiles: (
    inputFileIds: FileId[],
    outputs: StirlingFile[],
    stubs: StirlingFileStub[],
  ) => Promise<unknown>;
  /** "new_file" adds the output as a separate file; "new_version" versions the input. */
  outputMode: "new_file" | "new_version";
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

  const results = await Promise.allSettled(
    pending.map(async (out) => {
      const blob = await downloadPolicyOutput(out.fileId);
      return {
        fileId: out.fileId,
        file: new File([blob], out.fileName || run.fileName, {
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
  if (ctx.outputMode === "new_version" && ctx.parentStub) {
    // Replace the input file with a versioned child (preserves its history).
    // The version records "automate" as its origin tool — a policy is a
    // multi-tool automation, not any single tool (redact/watermark/sanitize/…).
    const { stirlingFiles, stubs } = await createStirlingFilesAndStubs(
      files,
      ctx.parentStub,
      "automate",
    );
    await ctx.consumeFiles([run.fileId as FileId], stirlingFiles, stubs);
  } else {
    await ctx.addFiles(files);
  }
  const importedFileIds = [...done, ...fetched.map((f) => f.fileId)];
  updateRun(run.runId, {
    importedFileIds,
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
  // Mark synchronously, before any await, so neither the dispatch effect nor a
  // rapid Retry click can double-fire while the file bytes load.
  markDispatched(categoryId, fileId);
  try {
    const file = await fileStorage.getStirlingFile(fileId);
    if (!file) return; // file gone; nothing to run (already marked above).
    const runId = await runStoredPolicy(backendId, [file]);
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
    // Dispatch failed (offline / backend error). Already marked dispatched so we
    // don't hammer; the absent run simply won't appear in the activity feed.
  }
}

/** Poll a run's status until it reaches a terminal state (or the cap). */
async function poll(runId: string): Promise<void> {
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
    });
    if (isTerminal(view.status)) return;
  }
}
