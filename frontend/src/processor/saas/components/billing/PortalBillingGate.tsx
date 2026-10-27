import { Usage } from "@editor/portal/views/Usage";

/** Hosted billing uses app authentication and never offers instance-link renewal. */
export function PortalBillingGate() {
  return <Usage />;
}
