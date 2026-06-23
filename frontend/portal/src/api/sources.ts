import { httpJson } from "@portal/api/http";
import type { Source, SourcesResponse } from "@portal/mocks/sources";

/**
 * Sources service layer: the backend contract.
 *
 * Like the policies surface (and unlike the portal's mock-only `/v1/...` pages),
 * this calls the REAL Stirling base `/api/v1/sources` (SourceController), so it is
 * plug-and-play: drop MSW and these exact calls hit the live backend.
 */

export type {
  Source,
  SourceDetailRow,
  SourceKpi,
  SourcePolicyRef,
  SourceStatus,
  SourceView,
  SourcesResponse,
} from "@portal/mocks/sources";

/** GET /api/v1/sources: KPI strip + one row per source for the admin. */
export async function fetchSources(): Promise<SourcesResponse> {
  return httpJson<SourcesResponse>("/api/v1/sources");
}

/** POST /api/v1/sources: create (blank id) or update (matched id) a source. */
export async function createSource(source: Source): Promise<Source> {
  return httpJson<Source>("/api/v1/sources", { method: "POST", body: source });
}

/** DELETE /api/v1/sources/{id}: remove a source (409 if a policy references it). */
export async function deleteSource(id: string): Promise<void> {
  await httpJson<void>(`/api/v1/sources/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
