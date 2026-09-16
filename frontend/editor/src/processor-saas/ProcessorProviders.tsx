import { TierProvider } from "@processor/contexts/TierContext";
import { UIProvider } from "@processor/contexts/UIContext";
import { ProcessorChrome } from "@processor/components/ProcessorChrome";
import { LicenseProvider } from "@app/contexts/LicenseContext";
import { StartupPrompts } from "@app/components/startup/StartupPrompts";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";
import { CheckoutProvider } from "@app/contexts/CheckoutContext";

/**
 * SaaS provider stack. There is no account-link layer: the signed-in account IS
 * the SaaS account (auth is handled upstream by ProcessorAuthBoundary) and the tier
 * comes from the wallet (see processor-saas/contexts/usePlanTier). Dropping
 * LinkProvider / AccountLinkProvider / the login modal here keeps the link
 * machinery out of the SaaS bundle entirely.
 *
 * <p>Checkout is mounted so the buy doors on Usage & Billing are the same on both editions.
 * LicenseProvider comes with it rather than on its own account: CheckoutProvider calls
 * {@code useLicense}, which throws without one.
 */
export function ProcessorProviders() {
  return (
    <TierProvider>
      <UIProvider>
        <AppConfigProvider>
          <LicenseProvider>
            <CheckoutProvider>
              <StartupPrompts />
              <ProcessorChrome />
            </CheckoutProvider>
          </LicenseProvider>
        </AppConfigProvider>
      </UIProvider>
    </TierProvider>
  );
}
