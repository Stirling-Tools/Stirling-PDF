/**
 * The fixed set of tool operations the Policies feature can run, each as a typed
 * {@link ToolOperationDescriptor}. This is the type-safe source of truth the Policies catalogue,
 * setup wizard, and wire conversion all build on: every operation here has a known endpoint, a
 * typed frontend parameter model, and safe conversion to/from its backend request model.
 *
 * Covers every operation the Policies frontend uses today (across all categories):
 * redact + sanitize + watermark (security), ocr + flatten (ingestion/compliance),
 * compress (routing/retention). Adding a category operation means adding it here — the catalogue
 * cannot reference an operation that isn't typed.
 */

import { describeToolOperation } from "@app/hooks/tools/shared/toolOperationDescriptor";
import { redactOperationConfig } from "@app/hooks/tools/redact/useRedactOperation";
import { sanitizeOperationConfig } from "@app/hooks/tools/sanitize/useSanitizeOperation";
import { addWatermarkOperationConfig } from "@app/hooks/tools/addWatermark/useAddWatermarkOperation";
import { ocrOperationConfig } from "@app/hooks/tools/ocr/useOCROperation";
import { flattenOperationConfig } from "@app/hooks/tools/flatten/useFlattenOperation";
import { compressOperationConfig } from "@app/hooks/tools/compress/useCompressOperation";
import type { ToolOperationDescriptor } from "@app/hooks/tools/shared/toolOperationDescriptor";
import type { ToolApiParams, ToolEndpoint } from "@app/types/toolApiTypes";
import type { WirePipelineStep } from "@app/policies/types";

/**
 * Typed descriptor per policy tool. The key is the policy-facing tool id; the endpoint literal is
 * pinned here (redact resolves its endpoint dynamically, so it must be given explicitly).
 */
export const POLICY_OPERATIONS = {
  redact: describeToolOperation(
    "/api/v1/security/auto-redact",
    redactOperationConfig,
  ),
  sanitize: describeToolOperation(
    "/api/v1/security/sanitize-pdf",
    sanitizeOperationConfig,
  ),
  watermark: describeToolOperation(
    "/api/v1/security/add-watermark",
    addWatermarkOperationConfig,
  ),
  ocr: describeToolOperation("/api/v1/misc/ocr-pdf", ocrOperationConfig),
  flatten: describeToolOperation(
    "/api/v1/misc/flatten",
    flattenOperationConfig,
  ),
  compress: describeToolOperation(
    "/api/v1/misc/compress-pdf",
    compressOperationConfig,
  ),
} as const;

/** A policy tool id — the key of a typed operation in {@link POLICY_OPERATIONS}. */
export type PolicyToolId = keyof typeof POLICY_OPERATIONS;

/** The frontend parameter model for a given policy tool. */
export type PolicyParams<Id extends PolicyToolId> =
  (typeof POLICY_OPERATIONS)[Id] extends ToolOperationDescriptor<
    ToolEndpoint,
    infer P
  >
    ? P
    : never;

/**
 * A configured policy step: a tool id paired with that tool's typed parameters. A discriminated
 * union over {@link PolicyToolId} so `params` is always the right shape for `toolId`.
 */
export type PolicyToolStep = {
  [Id in PolicyToolId]: { toolId: Id; params: PolicyParams<Id> };
}[PolicyToolId];

/** A policy step narrowed to a single tool id. */
export type PolicyToolStepOf<Id extends PolicyToolId> = Extract<
  PolicyToolStep,
  { toolId: Id }
>;

const POLICY_TOOL_IDS = Object.keys(POLICY_OPERATIONS) as PolicyToolId[];

const TOOL_ID_BY_ENDPOINT = new Map<string, PolicyToolId>(
  POLICY_TOOL_IDS.map((id) => [POLICY_OPERATIONS[id].endpoint, id]),
);

/** The endpoint a policy tool calls (a generated {@link ToolEndpoint} literal). */
export function policyEndpoint(toolId: PolicyToolId): ToolEndpoint {
  return POLICY_OPERATIONS[toolId].endpoint;
}

/** Map a stored step's endpoint path back to its policy tool id, or null if it isn't a policy tool. */
export function policyToolIdForEndpoint(endpoint: string): PolicyToolId | null {
  return TOOL_ID_BY_ENDPOINT.get(endpoint) ?? null;
}

/**
 * Build a policy step for `toolId`, merging the given partial params over the tool's defaults so
 * the result is always complete. Params are checked against the tool's frontend model, so a typo
 * or wrong-typed field is a compile error (not a value silently dropped at the backend).
 */
export function policyStep<Id extends PolicyToolId>(
  toolId: Id,
  params: Partial<PolicyParams<Id>> = {},
): PolicyToolStepOf<Id> {
  const defaults = POLICY_OPERATIONS[toolId].defaultParameters as object;
  return {
    toolId,
    params: { ...defaults, ...(params as object) },
  } as PolicyToolStepOf<Id>;
}

/**
 * Serialize a typed policy step to the backend wire step, mapping frontend params to the endpoint's
 * request model via the tool's `toApi`. This is the single frontend->backend boundary for policies.
 */
export function policyStepToWire(step: PolicyToolStep): WirePipelineStep {
  return serializeStep(step);
}

// Generic over the tool id to keep params correlated at the call sites. TypeScript can't correlate
// the indexed descriptor with the indexed params through a single generic, so `op` is widened to a
// same-params descriptor here — a contained cast at the (untyped) wire boundary.
function serializeStep<Id extends PolicyToolId>(step: {
  toolId: Id;
  params: PolicyParams<Id>;
}): WirePipelineStep {
  const op = POLICY_OPERATIONS[step.toolId] as ToolOperationDescriptor<
    ToolEndpoint,
    PolicyParams<Id>
  >;
  return {
    operation: op.endpoint,
    parameters: op.toApi(step.params) as Record<string, unknown>,
  };
}

/**
 * Rehydrate a stored wire step into a typed policy step via the tool's `fromApi`, or null if the
 * endpoint isn't a policy tool. This is the single backend->frontend boundary for policies; the one
 * cast lives here because wire parameters are untyped JSON from the backend.
 */
export function policyStepFromWire(
  wire: WirePipelineStep,
): PolicyToolStep | null {
  const toolId = policyToolIdForEndpoint(wire.operation);
  if (!toolId) return null;
  return deserializeStep(toolId, wire.parameters);
}

function deserializeStep<Id extends PolicyToolId>(
  toolId: Id,
  parameters: Record<string, unknown>,
): PolicyToolStepOf<Id> {
  const op = POLICY_OPERATIONS[toolId] as ToolOperationDescriptor<
    ToolEndpoint,
    PolicyParams<Id>
  >;
  // Wire parameters are untyped JSON from the backend; this cast is the single point where they
  // enter the typed model, after which `fromApi` maps them to the tool's frontend params.
  const params = op.fromApi(
    parameters as unknown as ToolApiParams[ToolEndpoint],
  );
  return { toolId, params } as unknown as PolicyToolStepOf<Id>;
}
