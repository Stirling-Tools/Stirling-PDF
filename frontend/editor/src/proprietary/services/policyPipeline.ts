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

import { resolveRunOn, type PolicyRunOn } from "@app/policies/runOn";
import type { AutomationConfig } from "@app/types/automation";
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
  /** Whether the editor runs this policy per file, and on which moment. */
  editor?: BackendEditorConfig;
}

/** Mirrors the backend `EditorConfig`. */
export interface BackendEditorConfig {
  allowed: boolean;
  runOn: PolicyRunOn;
}

/**
 * Where a policy run executes, and therefore where its output files live and
 * are downloaded from.
 */
export type PolicyExecutionTarget = "local" | "saas";

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
  /** Whether the editor runs this policy per file, straight from the policy's own flag. */
  runsOnEditor: boolean;
  scopeTypes: string[];
  reviewerEmail: string;
  fieldValues: Record<string, boolean | string | string[]>;
  folder: PolicyFolderSettings;
  /** Position in the team's server-side run order (set from the fetch list index,
   *  not decoded from the policy itself). */
  order?: number;
}

const DEFAULT_FOLDER: PolicyFolderSettings = {
  runOn: "upload",
  outputMode: "new_version",
  outputName: "",
  outputNamePosition: "prefix",
  maxRetries: 3,
  retryDelayMinutes: 5,
};

/** Decode a stored backend policy back into the frontend settings. */
export function fromBackendPolicy(policy: BackendPolicy): DecodedPolicy {
  const output = policy.output.options;
  // Metadata lives in output.options; legacy records kept it in trigger.options,
  // so merge both (output wins) to decode either shape.
  const meta = { ...(policy.trigger?.options ?? {}), ...output };
  const editor = policy.editor;
  const str = (v: unknown, fallback = "") =>
    typeof v === "string" ? v : fallback;
  const num = (v: unknown, fallback: number) =>
    typeof v === "number" ? v : fallback;
  const categoryId = str(meta.categoryId);
  return {
    id: policy.id,
    categoryId,
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
    runsOnEditor: editor?.allowed === true,
    folder: {
      runOn: resolveRunOn(editor?.runOn, categoryId),
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
