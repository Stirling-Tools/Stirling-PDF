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

/** A trigger kind and the source types it works with. Mirrors the backend `TriggerInfo`. */
export interface TriggerInfo {
  /** Matches `TriggerConfig.type` (e.g. "schedule", "folder-watch"). */
  type: string;
  /** Whether the trigger needs at least one compatible source to function. */
  requiresSource: boolean;
  /** Source types it supports; empty means source-agnostic (no constraint). */
  supportedSourceTypes: string[];
}

export type PolicyRunStatus =
  | "PENDING"
  | "RUNNING"
  | "WAITING_FOR_INPUT"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

/** A run's current state. Mirrors the backend `PolicyRunView` (outputs elided). */
export interface PolicyRunView {
  runId: string;
  policyId: string | null;
  status: PolicyRunStatus;
  currentStep: number;
  stepCount: number;
  /** Human-readable failure message; set when status is FAILED. */
  error: string | null;
  errorCode: string | null;
  createdAt: number;
}

/** GET /api/v1/policies/overview: KPI strip + one row per policy for the admin. */
export async function fetchPipelines(): Promise<PipelinesOverviewResponse> {
  return apiClient.local.json<PipelinesOverviewResponse>(
    "/api/v1/policies/overview",
  );
}

/** GET /api/v1/policies/{id}: the raw policy record (steps, sources, trigger), for editing. */
export async function fetchPipeline(id: string): Promise<Policy> {
  return apiClient.local.json<Policy>(
    `/api/v1/policies/${encodeURIComponent(id)}`,
  );
}

/** POST /api/v1/policies: create (blank id) or update (matched id) a policy. */
export async function savePipeline(policy: Policy): Promise<Policy> {
  return apiClient.local.json<Policy>("/api/v1/policies", {
    method: "POST",
    body: policy,
  });
}

/** DELETE /api/v1/policies/{id}: remove a policy. */
export async function deletePipeline(id: string): Promise<void> {
  await apiClient.local.json<void>(
    `/api/v1/policies/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    },
  );
}

/** GET /api/v1/policies/triggers: available triggers + their source compatibility. */
export async function fetchTriggers(): Promise<TriggerInfo[]> {
  return apiClient.local.json<TriggerInfo[]>("/api/v1/policies/triggers");
}

/**
 * POST /api/v1/policies/{id}/trigger: run the pipeline now against its configured
 * sources, regardless of the enabled flag. Returns the ids of the runs started
 * (empty when the sources yielded no work); poll {@link fetchRun} for each.
 */
export async function triggerPipeline(id: string): Promise<string[]> {
  return apiClient.local.json<string[]>(
    `/api/v1/policies/${encodeURIComponent(id)}/trigger`,
    { method: "POST" },
  );
}

/** GET /api/v1/policies/run/{runId}: current status, error, and step cursor of a run. */
export async function fetchRun(runId: string): Promise<PolicyRunView> {
  return apiClient.local.json<PolicyRunView>(
    `/api/v1/policies/run/${encodeURIComponent(runId)}`,
  );
}
