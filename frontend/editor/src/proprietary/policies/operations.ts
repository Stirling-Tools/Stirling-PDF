/**
 * The tool operations the Policies feature can run, each a typed {@link ToolOperationDescriptor}.
 * Source of truth for the catalogue, wizard, and wire conversion. Add a tool here to use it in a
 * policy - the catalogue can't reference an untyped operation.
 */

import { describeToolOperation } from "@app/hooks/tools/shared/toolOperationDescriptor";
import { redactOperationConfig } from "@app/hooks/tools/redact/useRedactOperation";
import { sanitizeOperationConfig } from "@app/hooks/tools/sanitize/useSanitizeOperation";
import { timestampPdfOperationConfig } from "@app/hooks/tools/timestampPdf/useTimestampPdfOperation";
import { addWatermarkOperationConfig } from "@app/hooks/tools/addWatermark/useAddWatermarkOperation";
import { ocrOperationConfig } from "@app/hooks/tools/ocr/useOCROperation";
import { flattenOperationConfig } from "@app/hooks/tools/flatten/useFlattenOperation";
import { compressOperationConfig } from "@app/hooks/tools/compress/useCompressOperation";
import type { ToolEndpoint } from "@app/types/toolApiTypes";
import type { WirePipelineStep } from "@app/policies/types";

/**
 * Endpoints for AI-dispatched policy tools. Intentionally NOT part of the generated
 * {@link ToolEndpoint} union: the backend controllers are `@Hidden` and `/api/v1/ai/tools/` is
 * deliberately excluded from tool-model generation, so they can't be typed like standard tools.
 */
export type AiPolicyEndpoint = "/api/v1/ai/tools/classify-and-label";

/** An AI tool usable in a policy — the AI-endpoint analogue of a standard tool descriptor. */
export interface AiToolDescriptor<TParams> {
  readonly endpoint: AiPolicyEndpoint;
  readonly defaultParameters: TParams;
  toApi(params: TParams): Record<string, unknown>;
  fromApi(api: Record<string, unknown>): TParams;
}

/**
 * Describe an AI-dispatched policy tool. AI tools carry no tunable parameters today, so params are
 * empty and the (de)serializers are identity over an empty object.
 */
export function describeAiToolOperation(
  endpoint: AiPolicyEndpoint,
): AiToolDescriptor<Record<string, never>> {
  return {
    endpoint,
    defaultParameters: {},
    toApi: () => ({}),
    fromApi: () => ({}),
  };
}

export const POLICY_OPERATIONS = {
  redact: describeToolOperation(
    "/api/v1/security/auto-redact",
    redactOperationConfig,
  ),
  sanitize: describeToolOperation(
    "/api/v1/security/sanitize-pdf",
    sanitizeOperationConfig,
  ),
  // RFC 3161 timestamp. Already a SISO tool; surfacing it here is what makes a signature durable
  // in a pipeline (PAdES-LTV), and only a SHA-256 hash reaches the TSA - never the document.
  timestampPdf: describeToolOperation(
    "/api/v1/security/timestamp-pdf",
    timestampPdfOperationConfig,
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
  classify: describeAiToolOperation("/api/v1/ai/tools/classify-and-label"),
} as const;

export type PolicyToolId = keyof typeof POLICY_OPERATIONS;

export type PolicyParams<Id extends PolicyToolId> =
  (typeof POLICY_OPERATIONS)[Id]["defaultParameters"];

/** Discriminated on `toolId` so `params` matches the tool. */
export type PolicyToolStep = {
  [Id in PolicyToolId]: { toolId: Id; params: PolicyParams<Id> };
}[PolicyToolId];

export type PolicyToolStepOf<Id extends PolicyToolId> = Extract<
  PolicyToolStep,
  { toolId: Id }
>;

const POLICY_TOOL_IDS = Object.keys(POLICY_OPERATIONS) as PolicyToolId[];

const TOOL_ID_BY_ENDPOINT = new Map<string, PolicyToolId>(
  POLICY_TOOL_IDS.map((id) => [POLICY_OPERATIONS[id].endpoint, id]),
);

/** A policy step's endpoint: a standard {@link ToolEndpoint} or an {@link AiPolicyEndpoint}. */
export type PolicyEndpoint = ToolEndpoint | AiPolicyEndpoint;

export function policyEndpoint(toolId: PolicyToolId): PolicyEndpoint {
  return POLICY_OPERATIONS[toolId].endpoint;
}

/** Tool id for an endpoint path, or null if it isn't a policy tool. */
export function policyToolIdForEndpoint(endpoint: string): PolicyToolId | null {
  return TOOL_ID_BY_ENDPOINT.get(endpoint) ?? null;
}

/** A step for `toolId`, partial params merged over the tool's defaults. */
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

export function policyStepToWire(step: PolicyToolStep): WirePipelineStep {
  return serializeStep(step);
}

/**
 * Minimal runtime shape shared by standard tool descriptors and {@link AiToolDescriptor}s — enough
 * to (de)serialize a step at the wire boundary regardless of how its endpoint is typed.
 */
interface PolicyOperation<TParams> {
  readonly endpoint: string;
  readonly defaultParameters: TParams;
  toApi(params: TParams): Record<string, unknown>;
  fromApi(api: Record<string, unknown>): TParams;
}

// Generic over the id so `params` stays correlated with the descriptor; TS can't do that through
// the union, so `op` is widened here (a contained cast at the wire boundary).
function serializeStep<Id extends PolicyToolId>(step: {
  toolId: Id;
  params: PolicyParams<Id>;
}): WirePipelineStep {
  const op = POLICY_OPERATIONS[step.toolId] as unknown as PolicyOperation<
    PolicyParams<Id>
  >;
  return {
    operation: op.endpoint,
    parameters: op.toApi(step.params),
  };
}

/** Wire step -> typed policy step, or null if the endpoint isn't a policy tool. */
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
  const op = POLICY_OPERATIONS[toolId] as unknown as PolicyOperation<
    PolicyParams<Id>
  >;
  // Wire params are untyped JSON; this is the one point they enter the typed model.
  const params = op.fromApi(parameters);
  return { toolId, params } as unknown as PolicyToolStepOf<Id>;
}
