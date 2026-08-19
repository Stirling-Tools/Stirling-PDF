/** The classification policy's catalog category id. */
export const CLASSIFICATION_CATEGORY_ID = "classification";

/**
 * Listed here, not derived from POLICY_CATEGORIES, to keep this module free of React imports.
 * Anything outside this set is a Pipelines-page pipeline, lacking category tile metadata.
 */
export const POLICY_CATEGORY_IDS: ReadonlySet<string> = new Set([
  "ingestion",
  "security",
  CLASSIFICATION_CATEGORY_ID,
  "compliance",
  "routing",
  "retention",
]);

/** Gates classification's special handling: async, never forks a version, always runs last. */
export function isClassificationCategory(categoryId: string): boolean {
  return categoryId === CLASSIFICATION_CATEGORY_ID;
}

/** Forces classification last so a persisted or displayed order cannot place it elsewhere. */
export function pinClassificationLast(orderedCategoryIds: string[]): string[] {
  return [
    ...orderedCategoryIds.filter((id) => !isClassificationCategory(id)),
    ...orderedCategoryIds.filter((id) => isClassificationCategory(id)),
  ];
}
