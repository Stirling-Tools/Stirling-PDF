import { isClassificationCategory } from "@app/data/policyCategories";
import type { PoliciesByCategory } from "@app/types/policies";

/**
 * The active upload policies in execution order: each runs on the previous one's output, so their
 * effects accumulate. Shared because dispatch, chaining and a retry all have to agree on this order.
 */
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
          // Non-AI systems classify in the browser (useClientSideClassification), so keep the
          // Classification policy out of the server chain when the AI engine is off.
          !(id === "classification" && !aiEnabled),
      )
      // Classification runs last: it's non-blocking, so an enforcement policy
      // running after it would fork a new version and drop the user's edits.
      .sort(([idA, a], [idB, b]) => {
        const ca = isClassificationCategory(idA) ? 1 : 0;
        const cb = isClassificationCategory(idB) ? 1 : 0;
        if (ca !== cb) return ca - cb;
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
