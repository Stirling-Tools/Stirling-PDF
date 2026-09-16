import type { ReactNode } from "react";
import { TierProvider } from "@processor/contexts/TierContext";
import { UIProvider } from "@processor/contexts/UIContext";

/** SaaS settings use the signed-in account, with no instance-link endpoints or dialog. */
export function ProcessorSettingsProviders({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <TierProvider>
      <UIProvider>{children}</UIProvider>
    </TierProvider>
  );
}
