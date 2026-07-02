/**
 * Backend layer for the team-scoped classification taxonomy
 * (`/api/v1/classification/taxonomy`). The backend is the source of truth: the
 * whole team shares one taxonomy, editable only by a team leader (SaaS) / admin
 * (self-hosted). A team with no stored taxonomy reads as 204 → `null`, and
 * callers fall back to the built-in {@link DEFAULT_CLASSIFICATION_TAXONOMY}.
 */

import apiClient from "@app/services/apiClient";
import type { ClassificationTaxonomy } from "@app/data/classificationTaxonomy";

const ENDPOINT = "/api/v1/classification/taxonomy";

/** The team's stored taxonomy, or `null` when it has none (use the default). */
export async function fetchTeamTaxonomy(): Promise<ClassificationTaxonomy | null> {
  const res = await apiClient.get<ClassificationTaxonomy | "">(ENDPOINT, {
    suppressErrorToast: true,
  });
  // 204 No Content (no stored taxonomy) comes back as an empty body. Only an
  // explicit 204 / empty string means "none"; anything else is a real payload.
  if (res.status === 204 || res.data === "") return null;
  return res.data as ClassificationTaxonomy;
}

/** Persist the team's taxonomy; returns the stored value. */
export async function saveTeamTaxonomy(
  taxonomy: ClassificationTaxonomy,
): Promise<ClassificationTaxonomy> {
  const res = await apiClient.put<ClassificationTaxonomy>(ENDPOINT, taxonomy);
  return res.data;
}
