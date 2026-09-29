import { useFreeCreditsSummary as useCloudFreeCreditsSummary } from "@cloud/hooks/useFreeCreditsSummary";
import { useSaaSMode } from "@app/hooks/useSaaSMode";
import { type NavFooterCredits } from "@app/components/shared/navFooter/NavFooterCreditsRow";

/**
 * Credits are a cloud concept. Local and self-hosted backends have no wallet, and the
 * cloud hook otherwise surfaces the last cached figures once a wallet has ever loaded, so
 * gate on SaaS mode: the footer meter stays hidden until the app is signed in to Stirling
 * Cloud. Mirrors {@link useWallet}.
 */
export function useFreeCreditsSummary(): NavFooterCredits | null {
  const saasMode = useSaaSMode();
  const credits = useCloudFreeCreditsSummary();
  return saasMode ? credits : null;
}
