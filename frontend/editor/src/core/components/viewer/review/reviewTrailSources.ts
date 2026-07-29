/**
 * Extension point for the review area. Core has no policy engine, so these are
 * inert; the proprietary overlay backs them with the policy run store.
 */

import { StirlingFileStub } from "@app/types/fileContext";
import { FileId } from "@app/types/file";
import { ReviewTrailRun } from "@app/types/review";

export function usePolicyTrailRuns(
  _stub: StirlingFileStub | undefined,
): ReviewTrailRun[] {
  return [];
}

/**
 * Ids of files needing review, oldest-flagged first — the review queue. Covers
 * stored files that aren't open, so callers load each on demand.
 */
export function useFileIdsNeedingReview(): FileId[] {
  return [];
}

export interface ReviewApproval {
  /** Whether the file currently has an unresolved failed policy run. */
  needsReview: boolean;
  /** Sign off on the file's failed runs, clearing its badge and export gate. */
  markApproved: () => void;
  /** Reverse a prior approval, restoring the "needs review" state. */
  undoApproved: () => void;
}

/** Review actions for the file under review, backed by the policy engine. */
export function useReviewApproval(
  _stub: StirlingFileStub | undefined,
): ReviewApproval {
  return { needsReview: false, markApproved: () => {}, undoApproved: () => {} };
}

/**
 * Forget a deleted file's review state. Called after the file is removed from
 * storage, so it stops being queued for review it can never receive.
 */
export function useForgetFileReview(): (fileId: FileId) => void {
  return () => {};
}
