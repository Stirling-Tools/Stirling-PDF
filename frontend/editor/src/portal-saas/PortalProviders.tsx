import { TierProvider } from "@portal/contexts/TierContext";
import { UIProvider } from "@portal/contexts/UIContext";
import { PortalChrome } from "@portal/components/PortalChrome";

/**
 * SaaS provider stack. There is no account-link layer: the signed-in account IS
 * the SaaS account (auth is handled upstream by PortalAuthBoundary) and the tier
 * comes from the wallet (see portal-saas/contexts/usePlanTier). Dropping
 * LinkProvider / AccountLinkProvider / the login modal here keeps the link
 * machinery out of the SaaS bundle entirely.
 */
export function PortalProviders() {
  return (
    <TierProvider>
      <UIProvider>
        <PortalChrome />
      </UIProvider>
    </TierProvider>
  );
}
