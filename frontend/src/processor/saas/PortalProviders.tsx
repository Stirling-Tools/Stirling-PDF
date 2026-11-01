import { TierProvider } from "@processor/contexts/TierContext";
import { UIProvider } from "@processor/contexts/UIContext";
import { PortalChrome } from "@processor/components/PortalChrome";
import { LicenseProvider } from "@editor/contexts/LicenseContext";
import { StartupPrompts } from "@editor/components/startup/StartupPrompts";
import { AppConfigProvider } from "@editor/contexts/AppConfigContext";
import { CheckoutProvider } from "@editor/contexts/CheckoutContext";

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
        <AppConfigProvider>
          <LicenseProvider>
            <CheckoutProvider>
              <StartupPrompts />
              <PortalChrome />
            </CheckoutProvider>
          </LicenseProvider>
        </AppConfigProvider>
      </UIProvider>
    </TierProvider>
  );
}
