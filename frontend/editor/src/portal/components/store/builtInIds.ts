/**
 * Ids of Stirling's own template listings. Kept apart from builtInListings, which builds the
 * listings from the template catalogue, so a card can tell a template from a published listing
 * without loading the catalogue and every tool behind it. The prefix is one the server never
 * issues (`sp-` + eight characters).
 */
export const BUILT_IN_PREFIX = "stirling-";

export function isBuiltInStoreId(storeId: string): boolean {
  return storeId.startsWith(BUILT_IN_PREFIX);
}

/** The template a built-in listing stands for, which the Pipelines page `?setup=` opens. */
export function builtInTemplateId(storeId: string): string | null {
  return isBuiltInStoreId(storeId)
    ? storeId.slice(BUILT_IN_PREFIX.length)
    : null;
}
