import { Usage } from "@app/portal/views/Usage";

/** Hosted billing uses app authentication and never offers instance-link renewal. */
export function PortalBillingGate() {
  return <Usage />;
}
