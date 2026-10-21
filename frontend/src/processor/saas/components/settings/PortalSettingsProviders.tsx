import type { ReactNode } from "react";
import { TierProvider } from "@portal/contexts/TierContext";
import { UIProvider } from "@portal/contexts/UIContext";

/** SaaS settings use the signed-in account, with no instance-link endpoints or dialog. */
export function PortalSettingsProviders({ children }: { children: ReactNode }) {
  return (
    <TierProvider>
      <UIProvider>{children}</UIProvider>
    </TierProvider>
  );
}
