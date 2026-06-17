/**
 * Bridge between the frontend automation model and the backend Policies engine.
 * "Backend automation" = send the whole pipeline + files to
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
import type { PolicyFolderSettings } from "@app/types/policies";

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
  /** Null for a manual-only (client-driven) policy — the editor fires runs on
   *  upload/export via /run, so there's no server-side trigger. */
  trigger: BackendTriggerConfig | null;
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
  /** ID of the stored policy that produced the run; null for ad-hoc pipelines. */
  policyId: string | null;
  status: PolicyRunStatus;
  currentStep: number;
  stepCount: number;
  error: string | null;
  /**
   * Stable failure code from the backend (e.g. an entitlement sentinel
   * {@code PAYG_LIMIT_REACHED} / {@code FEATURE_DEGRADED} propagated from a
   * downstream tool's 402). Null/absent for ordinary failures.
   */
  errorCode?: string | null;
  /**
   * For an entitlement-limit failure, the {@code subscribed} flag from the blocking 402 — picks the
   * spend-cap (true) vs free-limit (false) modal. Null/absent otherwise.
   */
  errorSubscribed?: boolean | null;
  outputs: BackendResultFile[];
  /** When the run was created (epoch millis); lets a rediscovered run show its real age. */
  createdAt: number;
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
 * Convert a tool's UI parameters into the exact scalar form-fields its backend
 * endpoint expects, by running the same `buildFormData` the client-side runner
 * uses (the one source of truth for the request shape) and keeping its non-file
 * fields. This is what makes the stored steps "marry up" with the engine: e.g.
 * redact's `wordsToRedact: string[]` becomes the `listOfText` string the
 * /auto-redact endpoint reads. Falls back to the raw params if the tool has no
 * transform (or it throws), so tools without one are unaffected.
 */
function toApiParameters(
  config: ToolRegistry[keyof ToolRegistry]["operationConfig"] | undefined,
  parameters: Record<string, unknown>,
): Record<string, unknown> {
  const build = config?.buildFormData;
  if (typeof build !== "function") return parameters;
  const dummy = new File([], "input.pdf", { type: "application/pdf" });
  // buildFormData takes a File (single-file tools) or File[] (multi) — try both.
  for (const fileArg of [dummy, [dummy]]) {
    try {
      const formData = build(parameters, fileArg as never);
      const out: Record<string, unknown> = {};
      // Keep scalar fields; skip File entries (the document(s) the engine feeds
      // separately, and any supporting-file blobs).
      formData.forEach((value, key) => {
        if (typeof value === "string") out[key] = value;
      });
      return out;
    } catch {
      // Wrong file-arg shape for this tool — try the other, then give up.
    }
  }
  return parameters;
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
    const config =
      toolRegistry[op.operation as keyof ToolRegistry]?.operationConfig;
    steps.push({
      operation: endpoint,
      parameters: toApiParameters(config, parameters),
    });
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

/** A frontend policy ready to persist on the backend (the full settings set). */
export interface PolicyToStore {
  /** Existing backend id (blank/omitted → create). */
  id?: string;
  /** The frontend catalog category this policy belongs to (1 policy per category). */
  categoryId: string;
  name: string;
  /** Active (enabled) vs paused/off. */
  enabled: boolean;
  /** Full frontend automation, stashed for a lossless UI round-trip. */
  automation: AutomationConfig;
  /**
   * The engine-runnable steps (endpoint paths), pre-built from `automation` via
   * the tool registry by the caller that has it (the wizard). The store layer
   * has no registry, so it receives these ready-made.
   */
  pipelineSteps: BackendPipelineStep[];
  sources: string[];
  scopeTypes: string[];
  reviewerEmail: string;
  fieldValues: Record<string, boolean | string | string[]>;
  folder: PolicyFolderSettings;
}

/** The decoded policy read back from the backend. */
export interface DecodedPolicy {
  id: string;
  /** The catalog category this policy maps to (from trigger.options.categoryId). */
  categoryId: string;
  name: string;
  enabled: boolean;
  /** Null if the stored policy carried no automation blob. */
  automation: AutomationConfig | null;
  sources: string[];
  scopeTypes: string[];
  reviewerEmail: string;
  fieldValues: Record<string, boolean | string | string[]>;
  folder: PolicyFolderSettings;
}

const DEFAULT_FOLDER: PolicyFolderSettings = {
  runOn: "upload",
  outputMode: "new_version",
  outputName: "",
  outputNamePosition: "prefix",
  maxRetries: 3,
  retryDelayMinutes: 5,
};

/**
 * Map a frontend policy to the backend {@link BackendPolicy} for persistence.
 * Policies are manual-only (client-driven): the editor fires runs on upload /
 * before export via /run, so `trigger` is null (a server-side folder-watch or
 * schedule trigger doesn't fit the in-editor model, and a null trigger skips
 * trigger validation on the backend). The backend models only
 * name/enabled/trigger/steps/output, so the policy-level extras (categoryId,
 * sources, scope, reviewer, fields) and the output + retry settings all ride in
 * `output.options`; the full frontend automation is stashed in
 * `output.options.automation` for a lossless UI round-trip (while `steps`
 * carries the endpoint-mapped pipeline the engine runs, pre-built by the caller).
 */
export function buildBackendPolicy(input: PolicyToStore): BackendPolicy {
  return {
    id: input.id ?? "",
    name: input.name,
    owner: "",
    enabled: input.enabled,
    trigger: null,
    steps: input.pipelineSteps,
    output: {
      type: "inline",
      options: {
        mode: input.folder.outputMode,
        name: input.folder.outputName,
        position: input.folder.outputNamePosition,
        maxRetries: input.folder.maxRetries,
        retryDelayMinutes: input.folder.retryDelayMinutes,
        automation: input.automation,
        runOn: input.folder.runOn,
        // Policy-level metadata (no trigger bag to hold it any more).
        categoryId: input.categoryId,
        sources: input.sources,
        scopeTypes: input.scopeTypes,
        reviewerEmail: input.reviewerEmail,
        fieldValues: input.fieldValues,
      },
    },
  };
}

/** Decode a stored backend policy back into the frontend settings. */
export function fromBackendPolicy(policy: BackendPolicy): DecodedPolicy {
  const output = policy.output.options;
  // Metadata lives in output.options; legacy records kept it in trigger.options,
  // so merge both (output wins) to decode either shape.
  const meta = { ...(policy.trigger?.options ?? {}), ...output };
  const str = (v: unknown, fallback = "") =>
    typeof v === "string" ? v : fallback;
  const num = (v: unknown, fallback: number) =>
    typeof v === "number" ? v : fallback;
  return {
    id: policy.id,
    categoryId: str(meta.categoryId),
    name: policy.name,
    enabled: policy.enabled,
    automation: (output.automation as AutomationConfig | undefined) ?? null,
    sources: Array.isArray(meta.sources) ? (meta.sources as string[]) : [],
    scopeTypes: Array.isArray(meta.scopeTypes)
      ? (meta.scopeTypes as string[])
      : [],
    reviewerEmail: str(meta.reviewerEmail),
    fieldValues:
      (meta.fieldValues as DecodedPolicy["fieldValues"] | undefined) ?? {},
    folder: {
      runOn: meta.runOn === "export" ? "export" : "upload",
      // Legacy/missing output.mode defaults to new_version, not new_file.
      outputMode: output.mode === "new_file" ? "new_file" : "new_version",
      outputName: str(output.name),
      outputNamePosition:
        output.position === "suffix"
          ? "suffix"
          : output.position === "auto-number"
            ? "auto-number"
            : "prefix",
      maxRetries: num(output.maxRetries, DEFAULT_FOLDER.maxRetries),
      retryDelayMinutes: num(
        output.retryDelayMinutes,
        DEFAULT_FOLDER.retryDelayMinutes,
      ),
    },
  };
}
