import type { ReactNode } from "react";
import { PortalSettingsSectionHost as BasePortalSettingsSectionHost } from "@portal-proprietary/components/settings/PortalSettingsSectionHost";
import { ProcessorEditionBoundary } from "@portal/ProcessorEditionBoundary";

/** Desktop: the base host inside the boundary that fixes its edition. */
export function PortalSettingsSectionHost({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ProcessorEditionBoundary>
      <BasePortalSettingsSectionHost>{children}</BasePortalSettingsSectionHost>
    </ProcessorEditionBoundary>
  );
}
