import { PortalBillingGate as CloudPortalBillingGate } from "@portal-cloud/components/billing/PortalBillingGate";
import { PortalBillingGate as ServerPortalBillingGate } from "@portal-proprietary/components/billing/PortalBillingGate";
import { editionComponent } from "@portal/edition";

/** Cloud: the account's own Usage. Server: the instance-link gate in front of
 *  the linked account's Usage. */
export const PortalBillingGate = editionComponent(
  CloudPortalBillingGate,
  ServerPortalBillingGate,
);
