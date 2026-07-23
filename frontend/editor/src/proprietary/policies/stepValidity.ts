import type { PolicyToolStep } from "@app/policies/operations";

/**
 * Whether a policy step is configured well enough to run. Mirrors the backend's
 * save-time PolicyStepValidator rules so the wizard can disable save instead of
 * letting the request bounce: a text watermark needs its text, an automatic
 * redact needs at least one pattern. Tools with no rule are always valid.
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
  return true;
}
