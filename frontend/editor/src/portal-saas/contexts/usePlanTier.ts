import { useAsync } from "@portal/hooks/useAsync";
import { fetchWallet } from "@portal/api/billing";
import type { Tier } from "@portal/contexts/TierContext";

/**
 * The plan tier the portal runs on, SaaS flavor: the signed-in account IS the
 * SaaS account, so the tier comes straight from the wallet — no link concept.
 * `subscribed` → the metered Processor tier; anything else (including while the
 * wallet is still loading) → free. Enterprise stays a mocks-only tier.
 */
export function usePlanTier(): Tier {
  const { data: wallet } = useAsync(() => fetchWallet(), []);
  return wallet?.status === "subscribed" ? "pro" : "free";
}
