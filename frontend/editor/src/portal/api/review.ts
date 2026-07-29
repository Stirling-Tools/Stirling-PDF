/**
 * Review service layer.
 *
 * The review bucket holds files that hit org-configured review conditions
 * instead of delivering them. The portal calls the real Stirling review API
 * (`/api/v1/review/...`); Storybook and tests intercept the same calls with
 * MSW handlers.
 */

import { apiClient } from "@portal/api/http";

/** The team-wide review-bucket configuration. */
export interface ReviewConfig {
  /** Master switch — nothing is held while this is off. */
  enabled: boolean;
  /** Classification label ids whose documents are always held. */
  watchedLabelIds: string[];
  /** Hold a run's files when the run itself fails. */
  holdFailedRuns: boolean;
  /** Hold documents the classifier assigns no label to. */
  holdUnlabeled: boolean;
  /** Hold documents whose best label lands under {@link confidenceThreshold}. */
  holdLowConfidence: boolean;
  /** 0–1 confidence floor for {@link holdLowConfidence}. */
  confidenceThreshold: number;
}

export type ReviewItemStatus = "PENDING" | "APPROVED" | "REJECTED";

export type ReviewReasonKind =
  | "WATCHED_LABEL"
  | "LOW_CONFIDENCE"
  | "SKIPPED_LABEL"
  | "NO_LABEL"
  | "RUN_FAILED";

/** Why an item was held. Each item carries some subset of the kinds. */
export interface ReviewReason {
  kind: ReviewReasonKind;
  /** What the reason is about: a classification label id, or for a confidence
   *  from another tool, whatever that tool scoped its number to. */
  labelId: string | null;
  /** 0-1 confidence, when the reason concerns one. */
  confidence: number | null;
  /** Free-text backend detail (e.g. the run's failure message). */
  detail: string | null;
  /** Which step reported the confidence ("classification", "ocr", ...). Absent on
   *  reasons that aren't about one, and on items held before producers existed
   *  (their stored JSON has no such key), so treat a missing value as the
   *  classifier — the only producer that existed then. */
  producer?: string | null;
}

export interface ReviewItemFile {
  fileId: string;
  fileName: string;
}

/** A label the classifier assigned to the held document. */
export interface ReviewItemLabel {
  labelId: string;
  /** 0–1 classifier confidence. */
  confidence: number;
}

export interface ReviewItem {
  id: string;
  runId: string;
  policyId: string;
  policyName: string;
  status: ReviewItemStatus;
  /** Epoch millis. */
  createdAt: number;
  /** Epoch millis; null while PENDING. */
  resolvedAt: number | null;
  /** Resolver's username; null while PENDING. */
  resolvedBy: string | null;
  files: ReviewItemFile[];
  reasons: ReviewReason[];
  labels: ReviewItemLabel[];
  /** Files are the run's unprocessed inputs (a failed run produced no
   *  outputs). Approving re-runs the pipeline on them instead of delivering. */
  filesAreInputs: boolean;
  /** Where approval sends the file, e.g. "Amazon S3 · processed/". */
  destination: string;
}

export interface ReviewItemsResponse {
  items: ReviewItem[];
}

/** GET /api/v1/review/config — the team-wide review-bucket configuration. */
export function fetchReviewConfig(): Promise<ReviewConfig> {
  return apiClient.local.json<ReviewConfig>("/api/v1/review/config");
}

/** PUT /api/v1/review/config — saves and returns the stored configuration. */
export function saveReviewConfig(config: ReviewConfig): Promise<ReviewConfig> {
  return apiClient.local.json<ReviewConfig>("/api/v1/review/config", {
    method: "PUT",
    body: config,
  });
}

/** GET /api/v1/review/items[?status=] — held items, optionally by status. */
export function fetchReviewItems(
  status?: ReviewItemStatus,
): Promise<ReviewItemsResponse> {
  const query = status ? `?status=${status}` : "";
  return apiClient.local.json<ReviewItemsResponse>(
    `/api/v1/review/items${query}`,
  );
}

/** POST /api/v1/review/items/{id}/approve — release the file to its destination. */
export function approveReviewItem(id: string): Promise<ReviewItem> {
  return apiClient.local.json<ReviewItem>(
    `/api/v1/review/items/${encodeURIComponent(id)}/approve`,
    { method: "POST" },
  );
}

/** POST /api/v1/review/items/{id}/reject — discard the held file. */
export function rejectReviewItem(id: string): Promise<ReviewItem> {
  return apiClient.local.json<ReviewItem>(
    `/api/v1/review/items/${encodeURIComponent(id)}/reject`,
    { method: "POST" },
  );
}

/** One item a bulk decision could not resolve. */
export interface BulkReviewFailure {
  itemId: string;
  reason: string | null;
}

/** Outcome of a bulk approve/reject: best effort, so failures are itemised. */
export interface BulkReviewResult {
  succeeded: number;
  failures: BulkReviewFailure[];
}

/** POST /api/v1/review/items/bulk/approve — release every listed item. */
export function approveReviewItems(
  itemIds: string[],
): Promise<BulkReviewResult> {
  return apiClient.local.json<BulkReviewResult>(
    "/api/v1/review/items/bulk/approve",
    { method: "POST", body: { itemIds } },
  );
}

/** POST /api/v1/review/items/bulk/reject — discard every listed item. */
export function rejectReviewItems(
  itemIds: string[],
): Promise<BulkReviewResult> {
  return apiClient.local.json<BulkReviewResult>(
    "/api/v1/review/items/bulk/reject",
    { method: "POST", body: { itemIds } },
  );
}

/** GET /api/v1/review/items/{id}/files/{fileId} — the held PDF's bytes. */
export function fetchReviewFile(id: string, fileId: string): Promise<Blob> {
  return apiClient.local.blob(
    `/api/v1/review/items/${encodeURIComponent(id)}/files/${encodeURIComponent(fileId)}`,
  );
}
