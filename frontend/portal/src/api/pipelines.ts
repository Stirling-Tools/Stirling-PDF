import { apiClient } from "@portal/api/http";

/**
 * Pipelines service layer: the backend contract.
 *
 * A "pipeline" in the portal IS a backend policy (PolicyController, Policy.java):
 * an ordered chain of tool steps with input sources, a trigger, and an output
 * destination. This surface lists EVERY backend policy (the user-facing Policies
 * page builds only a friendly subset of the same records). Like Sources, it calls
 * the REAL Stirling API base `/api/v1/policies`, so dropping MSW points these exact
 * calls at the live backend.
 */

/** One tool invocation in a pipeline. `operation` is a Stirling endpoint path. */
export interface PipelineStep {
  operation: string;
  parameters: Record<string, unknown>;
  fileParameters?: Record<string, string>;
}

/** When a policy fires automatically. `type` keys a trigger bean (e.g. "schedule"). */
export interface TriggerConfig {
  type: string;
  options: Record<string, unknown>;
}

/** Where a run's outputs are delivered. `type` keys an output sink (e.g. "inline"). */
export interface OutputSpec {
  type: string;
  options: Record<string, unknown>;
}

/**
 * The stored policy record: the create/update body (`id` blank on create) and what
 * the backend returns from GET/POST. Mirrors Policy.java exactly; `owner`/`teamId`
 * are stamped server-side. A `null` trigger means manual-only.
 */
export interface Policy {
  id?: string;
  name: string;
  owner?: string | null;
  enabled: boolean;
  trigger: TriggerConfig | null;
  sourceIds: string[];
  steps: PipelineStep[];
  output: OutputSpec;
  teamId?: number | null;
}

/** Overview row status: enabled (fires automatically) or paused. */
export type PipelineStatus = "active" | "paused";

/** A source a pipeline pulls documents from, resolved to its display name. */
export interface PipelineSourceRef {
  id: string;
  name: string;
}

/** One row in the Pipelines overview. Mirrors the backend `PolicyView`. */
export interface PipelineView {
  id: string;
  name: string;
  enabled: boolean;
  status: PipelineStatus;
  /** Trigger summary: "manual" or the trigger type (e.g. "schedule"). */
  trigger: string;
  sources: PipelineSourceRef[];
  /** Operation endpoint paths, in run order. */
  steps: string[];
  /** Output sink type (e.g. "inline", "folder"). */
  output: string;
  owner: string;
}

export interface PipelineKpi {
  value: number;
  description: string;
}

export interface PipelinesOverviewResponse {
  kpis: PipelineKpi[];
  pipelines: PipelineView[];
}

/** GET /api/v1/policies/overview: KPI strip + one row per policy for the admin. */
export async function fetchPipelines(): Promise<PipelinesOverviewResponse> {
  return apiClient.local.json<PipelinesOverviewResponse>("/api/v1/policies/overview");
}

/** GET /api/v1/policies/{id}: the raw policy record (steps, sources, trigger), for editing. */
export async function fetchPipeline(id: string): Promise<Policy> {
  return apiClient.local.json<Policy>(`/api/v1/policies/${encodeURIComponent(id)}`);
}

/** POST /api/v1/policies: create (blank id) or update (matched id) a policy. */
export async function savePipeline(policy: Policy): Promise<Policy> {
  return apiClient.local.json<Policy>("/api/v1/policies", { method: "POST", body: policy });
}

/** DELETE /api/v1/policies/{id}: remove a policy. */
export async function deletePipeline(id: string): Promise<void> {
  await apiClient.local.json<void>(`/api/v1/policies/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
