import type { SuperSearchGates } from "@app/types/superSearch";

/**
 * Whether the current user can enter the Processor at all: explicit portal
 * access, admin, or single-user mode with login disabled. Null gates (config
 * still loading) stay closed. A seam: desktop's "login disabled" is its bundled
 * backend, not a single-user server, so it answers from portal access alone.
 */
export function isProcessorGateOpen(gates: SuperSearchGates | null): boolean {
  return (
    !!gates &&
    (gates.portalAccessible === true || gates.isAdmin || !gates.loginEnabled)
  );
}
