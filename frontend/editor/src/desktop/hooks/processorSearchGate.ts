import type { SuperSearchGates } from "@app/types/superSearch";

/** Desktop: the editor's config describes the bundled backend, which always runs
 *  with login off, so only the connected server's portal-access answer counts. */
export function isProcessorGateOpen(gates: SuperSearchGates | null): boolean {
  return gates?.portalAccessible === true;
}
