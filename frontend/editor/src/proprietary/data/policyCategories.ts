/**
 * Stable policy-catalog category ids that need special-case handling in the
 * enforcement flow.
 */

/** The classification policy's catalog category id. */
export const CLASSIFICATION_CATEGORY_ID = "classification";

/**
 * Classification is metadata-only. Unlike enforcement policies (redact,
 * sanitize, encrypt, …) it never rewrites the document — it just reads it and
 * records labels. So it runs fully async to what the user is doing: it doesn't
 * block viewing/editing, doesn't fork a new file version, and doesn't appear in
 * version history; it only tags the file once it finishes. It also always runs
 * LAST in an enforcement chain, so it never lets the user in before an
 * enforcement policy that would fork a new version and drop their edits.
 */
export function isClassificationCategory(categoryId: string): boolean {
  return categoryId === CLASSIFICATION_CATEGORY_ID;
}

/**
 * Normalise a policy execution order so classification always sits last, keeping
 * every other category's relative order. The auto-run enforces this at execution
 * time regardless (see usePolicyAutoRun), but pinning it here — at the point an
 * order is persisted — means a reorder UI can never store or show classification
 * anywhere but last, so what the user sees matches when it actually runs.
 */
export function pinClassificationLast(orderedCategoryIds: string[]): string[] {
  return [
    ...orderedCategoryIds.filter((id) => !isClassificationCategory(id)),
    ...orderedCategoryIds.filter((id) => isClassificationCategory(id)),
  ];
}
