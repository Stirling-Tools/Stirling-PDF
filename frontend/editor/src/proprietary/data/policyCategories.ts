/** The classification policy's catalog category id. */
export const CLASSIFICATION_CATEGORY_ID = "classification";

/**
 * Classification is metadata-only: it runs async (never blocks), never forks a
 * version, and always runs last. This predicate gates that special handling.
 */
export function isClassificationCategory(categoryId: string): boolean {
  return categoryId === CLASSIFICATION_CATEGORY_ID;
}

/**
 * Move classification to the end of an execution order (others keep their order),
 * so a persisted/displayed order can't place it anywhere but last.
 */
export function pinClassificationLast(orderedCategoryIds: string[]): string[] {
  return [
    ...orderedCategoryIds.filter((id) => !isClassificationCategory(id)),
    ...orderedCategoryIds.filter((id) => isClassificationCategory(id)),
  ];
}
