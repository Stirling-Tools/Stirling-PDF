/**
 * Backend layer for classification labels (`/api/v1/classification/labels`).
 * Two scopes, both server-truth:
 *  - the TEAM set — one shared list, editable only by a team leader (SaaS) /
 *    admin (self-hosted); a team with none reads as 204 → `null`, and callers
 *    fall back to the built-in {@link DEFAULT_CLASSIFICATION_LABELS}.
 *  - the calling user's PERSONAL set (`…/labels/mine`) — additive labels that
 *    apply only to that user's own classification runs and sidebar.
 */

import apiClient from "@app/services/apiClient";
import type { ClassificationLabel } from "@app/data/classificationLabels";

const TEAM_ENDPOINT = "/api/v1/classification/labels";
const MINE_ENDPOINT = "/api/v1/classification/labels/mine";

/** Wire shape shared with the backend: the label list wrapped in an object. */
interface LabelsPayload {
  labels: ClassificationLabel[];
}

async function fetchLabels(
  endpoint: string,
): Promise<ClassificationLabel[] | null> {
  const res = await apiClient.get<LabelsPayload | "">(endpoint, {
    suppressErrorToast: true,
  });
  // 204 No Content (nothing stored) comes back as an empty body. Only an
  // explicit 204 / empty string means "none"; anything else is a real payload.
  if (res.status === 204 || res.data === "") return null;
  return (res.data as LabelsPayload).labels ?? [];
}

async function saveLabels(
  endpoint: string,
  labels: ClassificationLabel[],
): Promise<ClassificationLabel[]> {
  const res = await apiClient.put<LabelsPayload>(endpoint, { labels });
  return res.data.labels ?? [];
}

/** The team's stored labels, or `null` when it has none (use the default). */
export function fetchTeamLabels(): Promise<ClassificationLabel[] | null> {
  return fetchLabels(TEAM_ENDPOINT);
}

/** Persist the team's labels; returns the stored value. */
export function saveTeamLabels(
  labels: ClassificationLabel[],
): Promise<ClassificationLabel[]> {
  return saveLabels(TEAM_ENDPOINT, labels);
}

/** The calling user's personal labels, or `null` when none are stored. */
export function fetchMyLabels(): Promise<ClassificationLabel[] | null> {
  return fetchLabels(MINE_ENDPOINT);
}

/** Persist the calling user's personal labels; returns the stored value. */
export function saveMyLabels(
  labels: ClassificationLabel[],
): Promise<ClassificationLabel[]> {
  return saveLabels(MINE_ENDPOINT, labels);
}
