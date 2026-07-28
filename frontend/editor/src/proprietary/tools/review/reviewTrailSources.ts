/**
 * Proprietary review-trail extension point: maps policy run records onto the
 * review area's processing history and sign-off actions.
 */

import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  forgetFile,
  updateRun,
  usePolicyRuns,
} from "@app/components/policies/policyRunStore";
import type { PolicyRunRecord } from "@app/components/policies/policyRunStore";
import { loadPolicyCatalog } from "@app/services/policyCatalog";
import type { FileId } from "@app/types/file";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { ReviewStepStatus, ReviewTrailRun } from "@app/types/review";
// Import the shared contract from core (this file shadows the core module, so
// @app would resolve back to itself); re-export so @app consumers still see it.
import type { ReviewApproval } from "@core/tools/review/reviewTrailSources";

export type { ReviewApproval };

/** Terminal statuses only — an in-flight run has no outcome to review yet. */
const STEP_STATUS: Partial<Record<string, ReviewStepStatus>> = {
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "skipped",
};

/** Minimal provenance shape needed to resolve the reviewed file's runs. */
type LineageStub = {
  id: string;
  parentFileId?: string;
  sourceFileIds?: string[];
};

/**
 * Pure core of {@link usePolicyTrailRuns}. A run belongs to the file when it
 * was its input, its output, or the file derives from either.
 */
export function buildPolicyTrailRuns(
  runs: ReadonlyArray<PolicyRunRecord>,
  stub: LineageStub,
  labelById: ReadonlyMap<string, string>,
  stepLabel: string,
): ReviewTrailRun[] {
  const lineage = new Set<string>([
    stub.id,
    ...(stub.sourceFileIds ?? []),
    ...(stub.parentFileId ? [stub.parentFileId] : []),
  ]);
  const isForFile = (run: PolicyRunRecord) =>
    (run.fileId && lineage.has(run.fileId)) ||
    (run.outputFileIds ?? []).some((id) => lineage.has(id));

  return runs
    .filter((run) => STEP_STATUS[run.status] && isForFile(run))
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((run) => {
      const status = STEP_STATUS[run.status] as ReviewStepStatus;
      const failureDetail = [run.errorCode, run.error]
        .filter(Boolean)
        .join(" — ");
      return {
        id: run.runId,
        source: "policy" as const,
        name: labelById.get(run.categoryId) ?? run.categoryId,
        timestamp: run.startedAt,
        steps: [
          {
            id: `${run.runId}-outcome`,
            label: stepLabel,
            status,
            detail: status === "failed" ? failureDetail : undefined,
          },
        ],
      };
    });
}

/** The file's id plus everything it derives from, for attributing runs to it. */
function lineageOf(stub: LineageStub): Set<string> {
  return new Set<string>([
    stub.id,
    ...(stub.sourceFileIds ?? []),
    ...(stub.parentFileId ? [stub.parentFileId] : []),
  ]);
}

/** runIds of the file's failed, unacknowledged runs. A retrying run is still
 *  working, so it isn't offered for sign-off. */
export function failedRunIdsForFile(
  runs: ReadonlyArray<PolicyRunRecord>,
  stub: LineageStub,
): string[] {
  const lineage = lineageOf(stub);
  return runs
    .filter(
      (run) =>
        run.status === "FAILED" &&
        !run.retrying &&
        !run.acknowledged &&
        ((run.fileId && lineage.has(run.fileId)) ||
          (run.outputFileIds ?? []).some((id) => lineage.has(id))),
    )
    .map((run) => run.runId);
}

/** Statuses that settle a run — only these decide a file's current outcome. */
const TERMINAL_STATUSES = new Set(["COMPLETED", "FAILED", "CANCELLED"]);

/**
 * Files needing review, oldest-flagged first. Derived from the run store, not
 * the workspace, so flagged-but-closed files stay reachable — and by the badge
 * map's rule (LATEST terminal run per policy+file wins) so the two can't drift.
 */
export function orderFileIdsNeedingReview(
  runs: ReadonlyArray<PolicyRunRecord>,
): string[] {
  const latestByKey = new Map<string, PolicyRunRecord>();
  for (const run of runs) {
    if (!run.fileId || !TERMINAL_STATUSES.has(run.status)) continue;
    const key = `${run.categoryId}:${run.fileId}`;
    const prev = latestByKey.get(key);
    if (!prev || run.startedAt > prev.startedAt) latestByKey.set(key, run);
  }

  const flaggedAt = new Map<string, number>();
  for (const run of latestByKey.values()) {
    if (run.status !== "FAILED" || run.retrying || run.acknowledged) continue;
    const prev = flaggedAt.get(run.fileId);
    if (prev === undefined || run.startedAt < prev) {
      flaggedAt.set(run.fileId, run.startedAt);
    }
  }

  return [...flaggedAt.entries()]
    .sort(([, a], [, b]) => a - b)
    .map(([fileId]) => fileId);
}

export function useFileIdsNeedingReview(): FileId[] {
  const runs = usePolicyRuns();
  return useMemo(() => orderFileIdsNeedingReview(runs) as FileId[], [runs]);
}

export function usePolicyTrailRuns(
  stub: StirlingFileStub | undefined,
): ReviewTrailRun[] {
  const { t } = useTranslation();
  const runs = usePolicyRuns();

  return useMemo(() => {
    if (!stub) return [];
    const labelById = new Map(
      loadPolicyCatalog().categories.map((c) => [c.id, c.label]),
    );
    return buildPolicyTrailRuns(
      runs,
      stub,
      labelById,
      t("reviewTool.trail.enforcementRun", "Enforcement run"),
    );
  }, [runs, stub, t]);
}

export function useReviewApproval(
  stub: StirlingFileStub | undefined,
): ReviewApproval {
  const runs = usePolicyRuns();
  const failedIds = useMemo(
    () => (stub ? failedRunIdsForFile(runs, stub) : []),
    [runs, stub],
  );

  const markApproved = useCallback(() => {
    for (const runId of failedIds) updateRun(runId, { acknowledged: true });
  }, [failedIds]);

  // Restores every acknowledged failure, including from an earlier pass, so a
  // mis-click is fully reversible.
  const undoApproved = useCallback(() => {
    if (!stub) return;
    const lineage = lineageOf(stub);
    for (const run of runs) {
      if (
        run.status === "FAILED" &&
        run.acknowledged &&
        ((run.fileId && lineage.has(run.fileId)) ||
          (run.outputFileIds ?? []).some((id) => lineage.has(id)))
      ) {
        updateRun(run.runId, { acknowledged: false });
      }
    }
  }, [runs, stub]);

  return { needsReview: failedIds.length > 0, markApproved, undoApproved };
}

export function useForgetFileReview(): (fileId: FileId) => void {
  return useCallback((fileId: FileId) => forgetFile(fileId), []);
}
