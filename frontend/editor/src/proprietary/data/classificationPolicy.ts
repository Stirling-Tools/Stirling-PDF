/**
 * Everything specific to the built-in Classification policy, in one module. The generic policy
 * runner asks the capability questions below instead of naming classification itself, so a second
 * annotating policy needs a change here rather than in the runner.
 *
 * These are still keyed on the category id rather than a property each policy declares. That is
 * deliberate for now: policies are becoming pipelines with labels behind a separate enforcement
 * layer, which removes the category concept these would be declared against. Classification also
 * stays genuinely privileged - it is the only policy with a browser-side implementation, so it can
 * answer without the server. Ordering and output shape belong in that rework (an in-place output
 * mode, and a run result that can carry findings as well as files), not in a flag added here first.
 */

import type {
  ClassificationConfidence,
  StirlingFileStub,
} from "@app/types/fileContext";

/** Catalogue category id of the built-in Classification policy. */
export const CLASSIFICATION_CATEGORY_ID = "classification";

export function isClassificationCategory(categoryId: string): boolean {
  return categoryId === CLASSIFICATION_CATEGORY_ID;
}

/**
 * Whether the policy rewrites the document rather than only annotating it. Annotating policies are
 * ordered last: a rewriting one after them would fork from the pre-annotation version.
 */
export function policyRewritesDocument(categoryId: string): boolean {
  return !isClassificationCategory(categoryId);
}

/** Whether a completed run is expected to deliver output files (annotators deliver labels). */
export function policyDeliversOutputFiles(categoryId: string): boolean {
  return policyRewritesDocument(categoryId);
}

/** Whether the policy's server-side run exists only to escalate to the AI engine. */
export function policyRequiresAiEngine(categoryId: string): boolean {
  return isClassificationCategory(categoryId);
}

/** Order annotating policies last; everything else keeps the order it was given. */
export function orderRewritesFirst(categoryIds: string[]): string[] {
  return [
    ...categoryIds.filter(policyRewritesDocument),
    ...categoryIds.filter((id) => !policyRewritesDocument(id)),
  ];
}

/**
 * The one heuristic verdict trusted to stand on its own; anything less escalates to the AI, which
 * overwrites it. Deliberately strict - a wrong label costs more than an engine call.
 */
const TRUSTED_CONFIDENCE: ClassificationConfidence = "high";

/**
 * Whether the AI classifier should be asked about this file. For an upload, only once the
 * heuristic has reported: dispatching before then races the first pass and bills for an answer it
 * was about to produce. A tool-derived file gets no local pass (useClientSideClassification skips
 * it) and only ever carries an inherited verdict, so an absent verdict there is permanent -
 * escalate rather than wait for a report that will never come.
 */
export function shouldDispatchToAi(
  categoryId: string,
  stub: StirlingFileStub,
): boolean {
  if (!isClassificationCategory(categoryId)) return true;
  const confidence = stub.classificationConfidence;
  if (confidence == null) return Boolean(stub.derivedFromTool);
  return confidence !== TRUSTED_CONFIDENCE;
}
