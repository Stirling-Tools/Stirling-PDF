import { isPortalEntityScopeAccessible as isAccessibleOnServer } from "@editor-proprietary/data/processorSearchIndex";

export type { ProcessorSearchEntry } from "@editor-proprietary/data/processorSearchIndex";
export { PROCESSOR_SEARCH_INDEX } from "@editor-proprietary/data/processorSearchIndex";

/**
 * The Processor's entity search without the Users lane: on Stirling Cloud the
 * desktop settings carry no roster to open a member in, and the search scopes
 * are not recomputed on a mode switch, so the lane cannot follow the mode.
 */
export function isPortalEntityScopeAccessible(
  scopeId: string,
  isAdmin: boolean,
): boolean {
  return scopeId !== "portal-users" && isAccessibleOnServer(scopeId, isAdmin);
}
