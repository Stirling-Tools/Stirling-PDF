import {
  policyRequiresAiEngine,
  policyRewritesDocument,
} from "@app/data/classificationPolicy";
import type { PoliciesByCategory } from "@app/types/policies";

/** Active upload policies in execution order. Shared: dispatch, chaining and retry must agree. */
export function orderUploadCategories(
  policies: PoliciesByCategory,
  aiEnabled: boolean,
): string[] {
  return (
    Object.entries(policies)
      .filter(
        ([id, s]) =>
          s.configured &&
          s.status === "active" &&
          s.backendId &&
          (!s.sources ||
            s.sources.length === 0 ||
            s.sources.includes("editor")) &&
          (s.runOn ?? "upload") === "upload" &&
          // An escalation-only policy has nothing to do with no engine to escalate to.
          !(policyRequiresAiEngine(id) && !aiEnabled),
      )
      // Annotating policies run last: a rewriting one after them would fork a new
      // version from the pre-annotation state and drop their labels.
      .sort(([idA, a], [idB, b]) => {
        const ra = policyRewritesDocument(idA) ? 0 : 1;
        const rb = policyRewritesDocument(idB) ? 0 : 1;
        if (ra !== rb) return ra - rb;
        return (a.order ?? 0) - (b.order ?? 0);
      })
      .map(([id]) => id)
  );
}

/** The policy that runs on the given one's output, or undefined at the end of the chain. */
export function nextUploadCategory(
  orderedUploadCategories: string[],
  categoryId: string,
): string | undefined {
  const index = orderedUploadCategories.indexOf(categoryId);
  if (index < 0) return undefined;
  return orderedUploadCategories[index + 1];
}
