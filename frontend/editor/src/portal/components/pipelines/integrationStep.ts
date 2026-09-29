/**
 * Integration operations as pipeline steps.
 *
 * A pipeline step is an endpoint path plus parameters, and the engine dispatches it generically —
 * so an integration operation is already a legal step. What it lacked was a way to *pick* one and
 * *configure* it in the builder, whose picker is fed by the editor's tool registry and does not
 * know about them.
 *
 * These steps deliberately stay `toolId: null`. They are not registry tools, and pretending
 * otherwise would mean inventing a fake tool id that `serializeToolStep` would then try to resolve
 * an endpoint from. The unmapped path already round-trips a step verbatim, which is exactly the
 * behaviour wanted here; the only thing added is that the builder can now recognise and edit them
 * rather than showing them as an opaque "unknown step".
 */

import type { ErasedToolParams } from "@app/hooks/tools/shared/toolOperationTypes";
import type { WorkingToolStep } from "@app/hooks/tools/shared/toolAutomation";
import {
  buildStepParameters,
  emptyOperationValues,
  operationById,
  type StepOperation,
} from "@portal/components/policies/stepOperations";

/** The one endpoint every catalogue operation dispatches through. */
export const INTEGRATION_ENDPOINT = "/api/v1/integration/external-api-call";

export function isIntegrationStep(step: WorkingToolStep): boolean {
  return step.toolId === null && step.operation === INTEGRATION_ENDPOINT;
}

/** A new pipeline step for a chosen operation, seeded with the catalogue's defaults. */
export function newIntegrationStep(op: StepOperation): WorkingToolStep {
  const values = emptyOperationValues(op);
  return {
    toolId: null,
    operation: INTEGRATION_ENDPOINT,
    // Connection is chosen in the inspector; the step is created unconfigured on purpose so the
    // operator sees it in the chain and fills it in, rather than the picker blocking on a modal.
    params: buildStepParameters(op, "", values) as unknown as ErasedToolParams,
    support: "unknown",
  };
}

/**
 * The operation a step was built from, or undefined if it predates the catalogue (a pipeline
 * authored through the API can name the endpoint without an operationId).
 */
export function stepOperation(
  step: WorkingToolStep,
): StepOperation | undefined {
  if (!isIntegrationStep(step)) return undefined;
  const id = (step.params as Record<string, unknown>).operationId;
  return typeof id === "string" && id ? operationById(id) : undefined;
}

/** True once the step can actually run: an operation chosen and an account selected. */
export function integrationStepConfigured(step: WorkingToolStep): boolean {
  if (!isIntegrationStep(step)) return true;
  const params = step.params as Record<string, unknown>;
  return Boolean(params.operationId) && Boolean(params.connectionId);
}
