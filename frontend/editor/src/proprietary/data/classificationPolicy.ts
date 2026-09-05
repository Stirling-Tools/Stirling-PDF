/**
 * Everything specific to the built-in Classification policy, in one module. The generic policy runner
 * dispatches and chains only file-producing policies (see {@link orderedRewritingPolicies}), and the
 * generic local-pass engine runs whatever browser-side fast path a policy declares. Classification's
 * fast path (its heuristic) lives in classificationLocalPass; the capability answers below let the
 * generic engines treat it without naming it. A second annotating policy is a change here, not there.
 *
 * These are still keyed on the policy key rather than a property each policy declares. That is
 * deliberate for now: policies are becoming pipelines with labels behind a separate enforcement
 * layer, which removes the keyed-policy concept these would be declared against. Classification also
 * stays genuinely privileged - it is the only policy with a browser-side implementation, so it can
 * answer without the server. Ordering and output shape belong in that rework (an in-place output
 * mode, and a run result that can carry findings as well as files), not in a flag added here first.
 */

import type { ClassificationConfidence } from "@app/types/fileContext";
import type { PoliciesByKey } from "@app/types/policies";

/** Key of the built-in Classification policy. */
export const CLASSIFICATION_POLICY_KEY = "classification";

export function isClassificationPolicy(policyKey: string): boolean {
  return policyKey === CLASSIFICATION_POLICY_KEY;
}

/**
 * Whether the policy rewrites the document rather than only annotating it. Annotating policies are
 * ordered last: a rewriting one after them would fork from the pre-annotation version.
 */
export function policyRewritesDocument(policyKey: string): boolean {
  return !isClassificationPolicy(policyKey);
}

/** Whether a completed run is expected to deliver output files (annotators deliver labels). */
export function policyDeliversOutputFiles(policyKey: string): boolean {
  return policyRewritesDocument(policyKey);
}

/**
 * Whether the policy's server run needs the AI engine. The local-pass engine skips dispatching such
 * a run when the engine is off - there is nothing to escalate to, and the local verdict stands.
 */
export function policyRequiresAiEngine(policyKey: string): boolean {
  return isClassificationPolicy(policyKey);
}

/**
 * The active editor upload policies the generic runner dispatches and chains, in run order. Only
 * file-producing policies: an annotating policy (classification) has no output to chain onto and
 * runs itself, so it is intentionally absent here. Both the runner and the classification policy
 * read this - the runner to sequence the chain, classification to know when that chain is done.
 */
export function orderedRewritingPolicies(policies: PoliciesByKey): string[] {
  return Object.entries(policies)
    .filter(
      ([id, s]) =>
        s.configured &&
        s.enabled &&
        Boolean(s.backendId) &&
        s.runsOnEditor &&
        (s.runOn ?? "upload") === "upload" &&
        policyDeliversOutputFiles(id),
    )
    .sort(([, a], [, b]) => (a.order ?? 0) - (b.order ?? 0))
    .map(([id]) => id);
}

/**
 * The one heuristic verdict trusted to stand on its own; anything less escalates to the AI, which
 * overwrites it. Deliberately strict - a wrong label costs more than an engine call.
 */
const TRUSTED_CONFIDENCE: ClassificationConfidence = "high";

/**
 * Whether a local classification verdict must be escalated to the AI engine. A confident verdict
 * stands on its own; anything less is escalated and overwritten. Owned here, alongside the local
 * pass that produces the verdict - the runner is not involved.
 */
export function localVerdictNeedsEscalation(
  confidence: ClassificationConfidence | undefined,
): boolean {
  return confidence != null && confidence !== TRUSTED_CONFIDENCE;
}
