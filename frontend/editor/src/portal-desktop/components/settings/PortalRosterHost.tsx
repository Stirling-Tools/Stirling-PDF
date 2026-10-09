import type { ReactNode } from "react";
import { PortalRosterHost as BasePortalRosterHost } from "@portal-proprietary/components/settings/PortalRosterHost";
import { ProcessorEditionBoundary } from "@portal/ProcessorEditionBoundary";

/** Desktop: the base roster host inside the boundary that fixes its edition. */
export function PortalRosterHost({ children }: { children: ReactNode }) {
  return (
    <ProcessorEditionBoundary>
      <BasePortalRosterHost>{children}</BasePortalRosterHost>
    </ProcessorEditionBoundary>
  );
}
