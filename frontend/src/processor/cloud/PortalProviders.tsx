import type { ReactNode } from "react";
import { TierProvider } from "@processor/contexts/TierContext";
import { UIProvider } from "@processor/contexts/UIContext";
import { PortalChrome } from "@processor/components/PortalChrome";
import { StartupPrompts } from "@editor/components/startup/StartupPrompts";
import { CheckoutProvider } from "@editor/contexts/CheckoutContext";

/**
 * Stirling Cloud provider stack, shared by web SaaS and the desktop app. There is
 * no account-link layer: the signed-in account IS the SaaS account (auth is
 * handled upstream by PortalAuthBoundary) and the tier comes from the wallet (see
 * processor/cloud/contexts/usePlanTier). Dropping LinkProvider / AccountLinkProvider
 * / the login modal here keeps the link machinery out of the SaaS bundle entirely.
 *
 * <p>Checkout is mounted so the buy doors on Usage & Billing are the same on both editions.
 * `children` are overlays a host adds beside the chrome.
 */
export function PortalProviders({ children }: { children?: ReactNode }) {
  return (
    <TierProvider>
      <UIProvider>
        <CheckoutProvider>
          <StartupPrompts />
          {children}
          <PortalChrome />
        </CheckoutProvider>
      </UIProvider>
    </TierProvider>
  );
}
