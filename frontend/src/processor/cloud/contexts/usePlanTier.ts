import { useQuery } from "@tanstack/react-query";
import { walletQuery } from "@editor/portal/queries/wallet";
import type { Tier } from "@editor/portal/contexts/TierContext";

/**
 * The plan tier the portal runs on, SaaS flavor: the signed-in account IS the
 * SaaS account, so the tier comes straight from the wallet — no link concept.
 * Shares the billing query so trial, payment and expiry changes refresh every surface together.
 */
export function usePlanTier(): Tier {
  const { data: wallet } = useQuery(walletQuery(true));
  if (wallet?.enterprise) return "enterprise";
  return wallet?.status === "subscribed" ? "pro" : "free";
}
