import { isPortalEntityScopeAccessible as isAccessibleOnServer } from "@editor-proprietary/data/processorSearchIndex";
import { connectionModeService } from "@editor/services/connectionModeService";

export type { ProcessorSearchEntry } from "@editor-proprietary/data/processorSearchIndex";
export { PROCESSOR_SEARCH_INDEX } from "@editor-proprietary/data/processorSearchIndex";

/** The Users lane opens a member in Settings > Users, which desktop carries for a self-hosted server but not on Stirling Cloud. */
export function isPortalEntityScopeAccessible(
  scopeId: string,
  isAdmin: boolean,
): boolean {
  if (
    scopeId === "portal-users" &&
    connectionModeService.getCachedMode() !== "selfhosted"
  ) {
    return false;
  }
  return isAccessibleOnServer(scopeId, isAdmin);
}
