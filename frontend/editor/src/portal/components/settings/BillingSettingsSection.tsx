import { PortalBillingGate } from "@portal/components/billing/PortalBillingGate";
import "@portal/components/settings/BillingSettingsSection.css";

/** Shares the local allowance and linked wallet views with Processor billing. */
export function BillingSettingsSection() {
  return <PortalBillingGate />;
}
