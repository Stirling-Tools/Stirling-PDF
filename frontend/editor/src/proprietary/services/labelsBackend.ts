/**
 * Backend layer for the team's classification labels
 * (`/api/v1/classification/labels`) — one shared, server-truth list, editable
 * only by a team leader (SaaS) / admin (self-hosted). A team with none reads as
 * 204 → `null`, and callers fall back to the built-in
 * {@link DEFAULT_CLASSIFICATION_LABELS}.
 */

import apiClient from "@app/services/apiClient";
import {
  DEFAULT_CLASSIFICATION_LABELS,
  type ClassificationLabel,
} from "@app/data/classificationLabels";

const TEAM_ENDPOINT = "/api/v1/classification/labels";

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

/** Seed-write retry budget: the seed is a hard prerequisite (see below), so ride
 *  out a transient blip rather than fail setup on the first hiccup. */
const SEED_MAX_ATTEMPTS = 3;
const SEED_RETRY_MS = 400;

async function withRetry<T>(op: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < SEED_MAX_ATTEMPTS; attempt++) {
    try {
      return await op();
    } catch (error) {
      lastError = error;
      if (attempt < SEED_MAX_ATTEMPTS - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, SEED_RETRY_MS * (attempt + 1)),
        );
      }
    }
  }
  throw lastError;
}

/**
 * Seed the team's label set with the built-in defaults when it has none yet.
 *
 * The engine holds no default vocabulary, so the backend can only send what the
 * team has stored — a team with an empty set classifies nothing (documents come
 * back unlabelled and don't group). This writes the frontend's single default
 * copy into the team set the first time a classification policy is set up, so
 * classification works out of the box; the backend gates the write to admins.
 *
 * The seed is a hard prerequisite of enabling a classification policy, so it must
 * land or fail loudly — never silently leave an empty set behind a created
 * policy. Both the fetch and the write retry a transient failure; if either
 * ultimately fails this THROWS, and the caller aborts the setup (the admin sees
 * the error and retries) instead of shipping a policy that classifies nothing —
 * the same way a failed policy save already aborts setup. Still clobber-safe: it
 * writes only when the fetch DEFINITIVELY reports no set (204 → null), so it
 * never overwrites a team's real (possibly customised) labels, and it's a no-op
 * once any set exists (later admin edits are the source of truth).
 */
export async function seedTeamLabelsIfEmpty(): Promise<void> {
  const existing = await withRetry(fetchTeamLabels);
  if (existing != null) return;
  await withRetry(() => saveTeamLabels(DEFAULT_CLASSIFICATION_LABELS));
}
