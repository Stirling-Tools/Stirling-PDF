import { TierProvider } from "@processor/contexts/TierContext";
import { UIProvider } from "@processor/contexts/UIContext";
import { PortalChrome } from "@processor/components/PortalChrome";

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
