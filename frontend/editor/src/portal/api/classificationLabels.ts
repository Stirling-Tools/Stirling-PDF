// The team's classification vocabulary at `/api/v1/classification/labels`: one
// shared, server-truth list, 204 → `null` when the team has none. Routes through
// the portal's own `apiClient.local` (not the editor's axios client) so auth/base
// stays explicit; the wire shape and default vocabulary are shared with the editor.

import { apiClient } from "@portal/api/http";
import {
  DEFAULT_CLASSIFICATION_LABELS,
  type ClassificationLabel,
} from "@app/data/classificationLabels";

const TEAM_ENDPOINT = "/api/v1/classification/labels";

/** Wire shape shared with the backend: the label list wrapped in an object. */
interface LabelsPayload {
  labels: ClassificationLabel[];
}

/** The team's stored labels, or `null` when it has none (use the default). */
export async function fetchTeamLabels(): Promise<ClassificationLabel[] | null> {
  // 204 No Content (nothing stored) unwraps to `undefined` in the local client.
  const payload = await apiClient.local.json<LabelsPayload | undefined>(
    TEAM_ENDPOINT,
  );
  if (!payload) return null;
  return payload.labels ?? [];
}

/** Persist the team's labels; returns the stored value. */
export async function saveTeamLabels(
  labels: ClassificationLabel[],
): Promise<ClassificationLabel[]> {
  const payload = await apiClient.local.json<LabelsPayload | undefined>(
    TEAM_ENDPOINT,
    { method: "PUT", body: { labels } },
  );
  return payload?.labels ?? [];
}

// The seed is a hard prerequisite, so ride out a transient blip before failing setup.
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

// Seed the built-in defaults on first classification-policy setup — the engine
// holds no default, so an empty team set classifies nothing. Clobber-safe: writes
// only when the fetch DEFINITIVELY reports no set (204 → null), so it never
// overwrites a team's real labels, and it's a no-op once any set exists.
export async function seedTeamLabelsIfEmpty(): Promise<void> {
  const existing = await withRetry(fetchTeamLabels);
  if (existing != null) return;
  await withRetry(() => saveTeamLabels(DEFAULT_CLASSIFICATION_LABELS));
}
