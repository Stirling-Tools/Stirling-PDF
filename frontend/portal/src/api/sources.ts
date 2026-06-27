import { httpJson } from "@portal/api/http";

/**
 * Sources service layer: the backend contract.
 */

/** Overview row status: referenced and enabled, enabled-but-orphaned, or disabled. */
export type SourceStatus = "active" | "unused" | "disabled";

/** A policy that references a source. */
export interface SourcePolicyRef {
  id: string;
  name: string;
}

/** One key/value line summarising a source's config for display. */
export interface SourceDetailRow {
  label: string;
  value: string;
}

/** One row in the Sources overview table. Mirrors the backend `SourceView`. */
export interface SourceView {
  id: string;
  name: string;
  type: string;
  status: SourceStatus;
  referenceCount: number;
  referencingPolicies: SourcePolicyRef[];
  config: SourceDetailRow[];
  /** Per-source document volume: not tracked yet (always null for now). */
  docsTotal: number | null;
}

export interface SourceKpi {
  value: number;
  description: string;
}

export interface SourcesResponse {
  kpis: SourceKpi[];
  sources: SourceView[];
}

/**
 * The wire record for a single source: the create/update body (`id` omitted on
 * create) and what the backend returns from POST/GET. Mirrors the backend
 * `Source` record; `owner`/`teamId` are stamped server-side.
 */
export interface Source {
  id?: string;
  name: string;
  type: string;
  options: Record<string, unknown>;
  enabled: boolean;
  owner?: string | null;
  teamId?: number | null;
}

/** GET /api/v1/sources: KPI strip + one row per source for the admin. */
export async function fetchSources(): Promise<SourcesResponse> {
  return httpJson<SourcesResponse>("/api/v1/sources");
}

/** GET /api/v1/sources/{id}: the raw source record (config options), for editing. */
export async function fetchSource(id: string): Promise<Source> {
  return httpJson<Source>(`/api/v1/sources/${encodeURIComponent(id)}`);
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
