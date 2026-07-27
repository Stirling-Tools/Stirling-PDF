import type { PolicyToolStep } from "@app/policies/operations";

/** Steps that dereference an integration connection by id and are inert without one. */
const CONNECTION_TOOLS: ReadonlySet<PolicyToolStep["toolId"]> = new Set([
  "purviewApplyLabel",
  "purviewReadLabel",
  "externalApiCall",
]);

/**
 * Whether a policy step is configured well enough to run. Mirrors the backend's
 * save-time step validation (PipelineStepValidator beans) so the wizard can
 * disable save instead of letting the request bounce: a text watermark needs its
 * text, an automatic redact needs at least one pattern, an integration step
 * needs its connection. Tools with no rule are always valid.
 */
export function isPolicyStepConfigured(step: PolicyToolStep): boolean {
  if (step.toolId === "watermark") {
    const { watermarkType, watermarkText } = step.params;
    if (watermarkType === "image") return true;
    return typeof watermarkText === "string" && watermarkText.trim() !== "";
  }
  if (step.toolId === "redact") {
    const { wordsToRedact } = step.params;
    return Array.isArray(wordsToRedact) && wordsToRedact.length > 0;
  }
  if (CONNECTION_TOOLS.has(step.toolId)) {
    const { connectionId } = step.params as { connectionId?: unknown };
    return typeof connectionId === "string" && connectionId.trim() !== "";
  }
  return true;
}
