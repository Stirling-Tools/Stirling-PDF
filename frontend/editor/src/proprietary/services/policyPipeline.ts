/**
 * Bridge between the frontend automation model and the backend Policies engine
 * (PR #6527). "Backend automation" = send the whole pipeline + files to
 * `/api/v1/policies/run` and let the server orchestrate the steps, instead of
 * the browser running them one-by-one via executeAutomationSequence.
 *
 * The backend `PipelineStep.operation` is a tool endpoint *path*
 * (e.g. `/api/v1/misc/compress-pdf`) — exactly the `operationConfig.endpoint`
 * the frontend tool registry already carries for client-side execution. This
 * module maps a frontend AutomationConfig to the backend's PipelineDefinition
 * using that registry.
 */

import type { AutomationConfig } from "@app/types/automation";
import type { ToolRegistry } from "@app/data/toolsTaxonomy";

/** A single backend pipeline step: a tool endpoint path + its scalar params. */
export interface BackendPipelineStep {
  operation: string;
  parameters: Record<string, unknown>;
  fileParameters?: Record<string, string>;
}

/** Where the run's outputs are delivered. "inline" = return for download. */
export interface BackendOutputSpec {
  type: string;
  options: Record<string, unknown>;
}

/** The engine-level pipeline the `/run` endpoint accepts (as JSON). */
export interface BackendPipelineDefinition {
  name: string;
  steps: BackendPipelineStep[];
  output: BackendOutputSpec;
}

/** How a stored policy is triggered ("manual" | "folder" | "schedule" | "s3"). */
export interface BackendTriggerConfig {
  type: string;
  options: Record<string, unknown>;
}

/** A stored, owned policy on the backend (mirrors the Java `Policy` record). */
export interface BackendPolicy {
  /** Blank on create — the backend assigns an id and returns it. */
  id: string;
  name: string;
  owner: string;
  /** Gates automatic triggering; an explicit run ignores it. */
  enabled: boolean;
  trigger: BackendTriggerConfig;
  steps: BackendPipelineStep[];
  output: BackendOutputSpec;
}

/** Lifecycle states of a backend run (mirrors PolicyRunStatus). */
export type PolicyRunStatus =
  | "PENDING"
  | "RUNNING"
  | "WAITING_FOR_INPUT"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export interface BackendResultFile {
  fileId: string;
  fileName: string;
}

/** Read-only view returned by the run status endpoint (mirrors PolicyRunView). */
export interface PolicyRunView {
  runId: string;
  status: PolicyRunStatus;
  currentStep: number;
  stepCount: number;
  error: string | null;
  outputs: BackendResultFile[];
}

/** Resolve a frontend operation id to its backend tool endpoint path. */
function resolveEndpoint(
  operation: string,
  parameters: Record<string, unknown>,
  toolRegistry: Partial<ToolRegistry>,
): string | null {
  const config = toolRegistry[operation as keyof ToolRegistry]?.operationConfig;
  const endpoint = config?.endpoint;
  if (!endpoint) return null;
  const resolved =
    typeof endpoint === "function" ? endpoint(parameters) : endpoint;
  return resolved ?? null;
}

/**
 * Map a frontend automation to the backend pipeline definition. Steps whose
 * endpoint can't be resolved from the registry are dropped (and reported), so
 * the backend never receives an unrunnable operation id.
 */
export function buildPipelineDefinition(
  automation: Pick<AutomationConfig, "name" | "operations">,
  toolRegistry: Partial<ToolRegistry>,
): { definition: BackendPipelineDefinition; unresolved: string[] } {
  const unresolved: string[] = [];
  const steps: BackendPipelineStep[] = [];
  for (const op of automation.operations) {
    const parameters = (op.parameters ?? {}) as Record<string, unknown>;
    const endpoint = resolveEndpoint(op.operation, parameters, toolRegistry);
    if (!endpoint) {
      unresolved.push(op.operation);
      continue;
    }
    steps.push({ operation: endpoint, parameters });
  }
  return {
    definition: {
      name: automation.name,
      steps,
      output: { type: "inline", options: {} },
    },
    unresolved,
  };
}

/** A frontend policy ready to persist on the backend. */
export interface PolicyToStore {
  /** Existing backend id (blank/omitted → create). */
  id?: string;
  name: string;
  /** Active (enabled) vs paused/off. */
  enabled: boolean;
  automation: Pick<AutomationConfig, "name" | "operations">;
}

/**
 * Map a frontend policy to the backend {@link BackendPolicy} for persistence.
 * Trigger is "manual" for now (the backend only implements manual triggering;
 * the "all uploaded files" trigger is a frontend concept until a backend
 * trigger type exists). Returns any unresolved step ops alongside.
 */
export function buildBackendPolicy(
  input: PolicyToStore,
  toolRegistry: Partial<ToolRegistry>,
): { policy: BackendPolicy; unresolved: string[] } {
  const { definition, unresolved } = buildPipelineDefinition(
    input.automation,
    toolRegistry,
  );
  return {
    policy: {
      id: input.id ?? "",
      name: input.name,
      owner: "",
      enabled: input.enabled,
      trigger: { type: "manual", options: {} },
      steps: definition.steps,
      output: definition.output,
    },
    unresolved,
  };
}
