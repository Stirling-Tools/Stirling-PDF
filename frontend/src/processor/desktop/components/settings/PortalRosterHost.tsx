import type { ReactNode } from "react";
import { PortalRosterHost as BasePortalRosterHost } from "@processor-proprietary/components/settings/PortalRosterHost";
import { ProcessorEditionBoundary } from "@processor/ProcessorEditionBoundary";

/** Desktop: the base roster host inside the boundary that fixes its edition. */
export function PortalRosterHost({ children }: { children: ReactNode }) {
  return (
    <ProcessorEditionBoundary>
      <BasePortalRosterHost>{children}</BasePortalRosterHost>
    </ProcessorEditionBoundary>
  );
}
