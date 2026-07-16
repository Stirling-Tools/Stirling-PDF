import { apiClient } from "@portal/api/http";

/**
 * Outputs service layer: the backend contract.
 *
 * An output is a persisted, reusable destination (folder, S3) a policy delivers
 * its processed files to - the mirror image of a Source. Configured once here and
 * referenced by id from any number of policies. Calls the real Stirling API base
 * `/api/v1/outputs`.
 */

/** Overview row status: referenced and enabled, enabled-but-orphaned, or disabled. */
export type OutputStatus = "active" | "unused" | "disabled";

/** A policy that writes to an output. */
export interface OutputPolicyRef {
  id: string;
  name: string;
}

/** One key/value line summarising an output's config for display. */
export interface OutputDetailRow {
  label: string;
  value: string;
}

/** One row in the Outputs overview table. Mirrors the backend `OutputView`. */
export interface OutputView {
  id: string;
  name: string;
  type: string;
  status: OutputStatus;
  referenceCount: number;
  referencingPolicies: OutputPolicyRef[];
  config: OutputDetailRow[];
}

export interface OutputKpi {
  value: number;
  description: string;
}

export interface OutputsResponse {
  kpis: OutputKpi[];
  outputs: OutputView[];
}

/**
 * The wire record for a single output: the create/update body (`id` omitted on
 * create) and what the backend returns from POST/GET. Mirrors the backend
 * `Output` record; `owner`/`teamId` are stamped server-side.
 */
export interface Output {
  id?: string;
  name: string;
  type: string;
  options: Record<string, unknown>;
  enabled: boolean;
  owner?: string | null;
  teamId?: number | null;
}

/** GET /api/v1/outputs: KPI strip + one row per output for the admin. */
export async function fetchOutputs(): Promise<OutputsResponse> {
  return apiClient.local.json<OutputsResponse>("/api/v1/outputs");
}

/** GET /api/v1/outputs/{id}: the raw output record (config options), for editing. */
export async function fetchOutput(id: string): Promise<Output> {
  return apiClient.local.json<Output>(
    `/api/v1/outputs/${encodeURIComponent(id)}`,
  );
}

/** POST /api/v1/outputs: create (blank id) or update (matched id) an output. */
export async function createOutput(output: Output): Promise<Output> {
  return apiClient.local.json<Output>("/api/v1/outputs", {
    method: "POST",
    body: output,
  });
}

/** DELETE /api/v1/outputs/{id}: remove an output (409 if a policy references it). */
export async function deleteOutput(id: string): Promise<void> {
  await apiClient.local.json<void>(
    `/api/v1/outputs/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    },
  );
}
