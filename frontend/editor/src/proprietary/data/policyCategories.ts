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
