import { apiClient } from "@portal/api/http";

/**
 * Recorded policy and pipeline failures, mirroring the backend `FileRunEventView`.
 *
 * Two properties of the contract: the server sends i18n keys plus an English
 * `defaultTitle` rather than rendered copy, so a client can display a kind it was
 * not built with; and each row's `actions` arrive already resolved, so rendering
 * buttons needs no knowledge of the rules.
 */

/** Where the fault lay. Widened server-side ahead of the kinds that need it. */
export type FailureStage =
  | "INPUT"
  | "INTERNAL"
  | "OUTPUT"
  | "BLOCKED"
  | "NEVER_RAN";

export type FailureSeverity = "ERROR" | "WARNING" | "INFO";

export type FailureRemedy =
  | "TRANSIENT"
  | "NEEDS_USER_INPUT"
  | "NEEDS_FILE_FIX"
  | "NEEDS_CONFIG_FIX"
  | "NEEDS_SERVER_FIX"
  | "PERMANENT";

export type FailureScope = "FILE" | "RUN" | "POLICY" | "SOURCE" | "SERVER";

export type FailureOrigin = "EDITOR" | "PROCESSOR" | "API";

export type FileRunEventStatus =
  | "NEW"
  | "ACKNOWLEDGED"
  | "DISMISSED"
  | "RESOLVED";

/**
 * One button as offered for one row. `id` is a plain string rather than a union
 * because the server may know actions this build does not; the renderer skips them.
 */
export interface FailureActionOffer {
  id: string;
  labelKey: string;
  enabled: boolean;
  disabledReasonKey: string | null;
}

export interface FileRunEvent {
  id: string;
  kindId: string;
  stage: FailureStage;
  severity: FailureSeverity;
  scope: FailureScope;
  origin: FailureOrigin;
  remedy: FailureRemedy;
  titleKey: string;
  descriptionKey: string;
  /** English fallback, used when this build has no translation for `titleKey`. */
  defaultTitle: string;
  /** Raw failure message. For an unclassified failure this is the only detail. */
  detail: string | null;
  policyId: string | null;
  runId: string | null;
  /**
   * Opaque reference, never a name. Only the owner's own client can resolve it to
   * something readable, from its local file store.
   */
  fileId: string | null;
  actor: string | null;
  /** How many times this same failure has been seen; repeats fold into one row. */
  occurrences: number;
  status: FileRunEventStatus;
  statusActor: string | null;
  actions: FailureActionOffer[];
  createdAt: number;
  lastSeenAt: number;
}

export interface FileRunEventsResponse {
  events: FileRunEvent[];
}

export interface ListFileRunEventsParams {
  status?: FileRunEventStatus;
  kindId?: string;
  limit?: number;
}

/** GET /api/v1/file-run-events — the caller's team only; there is no team param. */
export async function fetchFileRunEvents(
  params: ListFileRunEventsParams = {},
): Promise<FileRunEvent[]> {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.kindId) query.set("kindId", params.kindId);
  if (params.limit != null) query.set("limit", String(params.limit));
  const suffix = query.toString() ? `?${query}` : "";

  const response = await apiClient.local.json<FileRunEventsResponse>(
    `/api/v1/file-run-events${suffix}`,
  );
  return response?.events ?? [];
}

/** POST /api/v1/file-run-events/{id}/actions/{actionId} — returns the updated row. */
export async function applyFileRunEventAction(
  eventId: string,
  actionId: string,
  inputs: Record<string, string> = {},
): Promise<FileRunEvent> {
  return apiClient.local.json<FileRunEvent>(
    `/api/v1/file-run-events/${encodeURIComponent(eventId)}/actions/${encodeURIComponent(actionId)}`,
    // A plain object, not a JSON string: apiClient serialises `body` itself, so
    // pre-stringifying would double-encode it.
    { method: "POST", body: { inputs } },
  );
}
