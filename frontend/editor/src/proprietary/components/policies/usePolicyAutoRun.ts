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
import { useAllFiles, useFileManagement } from "@app/contexts/FileContext";
import { fileStorage } from "@app/services/fileStorage";
import { POLICIES_ENABLED } from "@app/constants/featureFlags";
import {
  runStoredPolicy,
  getPolicyRun,
  downloadPolicyOutput,
} from "@app/services/policyApi";
import type { PolicyRunStatus } from "@app/services/policyPipeline";
import type { FileId } from "@app/types/file";
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

  // Import each completed run's outputs into the workspace (once per run), so the
  // enforced file actually appears in the app rather than only on the backend.
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
      void importOutputs(run, addFiles).finally(() =>
        importing.current.delete(run.runId),
      );
    }
  }, [runs, addFiles]);
}

/** Fetch a completed run's output files and add them to the workspace. */
async function importOutputs(
  run: PolicyRunRecord,
  addFiles: (files: File[]) => Promise<unknown>,
): Promise<void> {
  try {
    const files = await Promise.all(
      run.outputs.map(async (out) => {
        const blob = await downloadPolicyOutput(out.fileId);
        return new File([blob], out.fileName || run.fileName, {
          type: blob.type || "application/pdf",
        });
      }),
    );
    if (files.length > 0) await addFiles(files);
    updateRun(run.runId, { imported: true });
  } catch {
    // Leave imported=false so it retries on a later tick (transient failure).
  }
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
