import { TierProvider } from "@portal/contexts/TierContext";
import { UIProvider } from "@portal/contexts/UIContext";
import { PortalChrome } from "@portal/components/PortalChrome";
import { LicenseProvider } from "@app/contexts/LicenseContext";
import { CheckoutProvider } from "@app/contexts/CheckoutContext";

/**
 * SaaS provider stack. There is no account-link layer: the signed-in account IS
 * the SaaS account (auth is handled upstream by PortalAuthBoundary) and the tier
 * comes from the wallet (see portal-saas/contexts/usePlanTier). Dropping
 * LinkProvider / AccountLinkProvider / the login modal here keeps the link
 * machinery out of the SaaS bundle entirely.
 *
 * <p>Checkout is mounted so the buy doors on Usage & Billing are the same on both editions.
 * LicenseProvider comes with it rather than on its own account: CheckoutProvider calls
 * {@code useLicense}, which throws without one.
 */
export function PortalProviders() {
  return (
    <TierProvider>
      <UIProvider>
        <LicenseProvider>
          <CheckoutProvider>
            <PortalChrome />
          </CheckoutProvider>
        </LicenseProvider>
      </UIProvider>
    </TierProvider>
  );
}
