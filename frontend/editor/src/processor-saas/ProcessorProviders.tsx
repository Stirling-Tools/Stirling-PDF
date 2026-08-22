import { TierProvider } from "@processor/contexts/TierContext";
import { UIProvider } from "@processor/contexts/UIContext";
import { ProcessorChrome } from "@processor/components/ProcessorChrome";

/**
 * SaaS provider stack. There is no account-link layer: the signed-in account IS
 * the SaaS account (auth is handled upstream by ProcessorAuthBoundary) and the tier
 * comes from the wallet (see processor-saas/contexts/usePlanTier). Dropping
 * LinkProvider / AccountLinkProvider / the login modal here keeps the link
 * machinery out of the SaaS bundle entirely.
 */
export function ProcessorProviders() {
  return (
    <TierProvider>
      <UIProvider>
        <ProcessorChrome />
      </UIProvider>
    </TierProvider>
  );
}
