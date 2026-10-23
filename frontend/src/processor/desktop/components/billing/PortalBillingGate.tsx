import { PortalBillingGate as CloudPortalBillingGate } from "@processor-cloud/components/billing/PortalBillingGate";
import { PortalBillingGate as ServerPortalBillingGate } from "@processor-proprietary/components/billing/PortalBillingGate";
import { editionComponent } from "@processor/edition";

/** Cloud: the account's own Usage. Server: the instance-link gate in front of
 *  the linked account's Usage. */
export const PortalBillingGate = editionComponent(
  CloudPortalBillingGate,
  ServerPortalBillingGate,
);
