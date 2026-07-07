import { Usage } from "@portal/views/Usage";

/**
 * SaaS billing gate: there is no link concept — the signed-in account IS the SaaS
 * account (auth is handled upstream by PortalAuthBoundary), so render the Usage
 * page directly. No link state, no prompt, no re-auth wiring.
 */
export function PortalBillingGate() {
  return <Usage />;
}
