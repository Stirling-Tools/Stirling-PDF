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
import { useAllFiles } from "@app/contexts/FileContext";
import { fileStorage } from "@app/services/fileStorage";
import { POLICIES_ENABLED } from "@app/constants/featureFlags";
import { runStoredPolicy, getPolicyRun } from "@app/services/policyApi";
import type { PolicyRunStatus } from "@app/services/policyPipeline";
import type { FileId } from "@app/types/file";
import { usePolicies } from "@app/hooks/usePolicies";
import {
  isDispatched,
  markDispatched,
  recordRunStart,
  updateRun,
  usePolicyRuns,
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
  const { policies } = usePolicies();
  const runs = usePolicyRuns();
  // Run ids currently being polled, so the poll effect never double-polls.
  const polling = useRef<Set<string>>(new Set());

  // Dispatch: for each active policy × each session file not yet run, fire a run.
  useEffect(() => {
    if (!POLICIES_ENABLED) return;
    const active = Object.entries(policies).filter(
      ([, s]) => s.configured && s.status === "active" && s.backendId,
    );
    for (const [categoryId, s] of active) {
      for (const stub of fileStubs) {
        if (isDispatched(categoryId, stub.id)) continue;
        // Mark synchronously so a re-render mid-dispatch can't double-fire.
        markDispatched(categoryId, stub.id);
        void dispatch(categoryId, s.backendId as string, stub.id, stub.name);
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
}

/** Resolve the file's bytes, fire the run, and record it. */
async function dispatch(
  categoryId: string,
  backendId: string,
  fileId: FileId,
  fileName: string,
): Promise<void> {
  try {
    const file = await fileStorage.getStirlingFile(fileId);
    if (!file) return; // already marked dispatched; nothing to run.
    const runId = await runStoredPolicy(backendId, [file]);
    recordRunStart({
      runId,
      categoryId,
      fileId,
      fileName,
      fileSize: file.size,
      status: "PENDING",
      outputFileIds: [],
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
      outputFileIds: view.outputs.map((o) => o.fileId),
      error: view.error,
    });
    if (isTerminal(view.status)) return;
  }
}
