import type { CapacityCheckoutProviderComponent } from "@portal/api/capacityCheckout";
import { LicenseProvider } from "@app/contexts/LicenseContext";
import { CheckoutProvider } from "@app/contexts/CheckoutContext";

/**
 * Self-hosted build: mounts the editor's checkout stack inside the portal so the Users page
 * can sell capacity.
 *
 * Must sit under an `AppConfigProvider`, which `LicenseProvider` reads. Mounting `CheckoutProvider`
 * here also puts its checkout-return handler on portal routes, which is what we want: a purchase
 * started from the portal comes back to the portal.
 */
export const CapacityCheckoutProvider: CapacityCheckoutProviderComponent = ({
  children,
}) => (
  <LicenseProvider>
    <CheckoutProvider>{children}</CheckoutProvider>
  </LicenseProvider>
);
