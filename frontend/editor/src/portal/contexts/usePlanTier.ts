import { useLink, type LinkState } from "@portal/contexts/LinkContext";
import type { Tier } from "@portal/contexts/TierContext";

/** Maps the self-hosted link/subscription state onto the portal tier. */
function tierFromLinkState(linkState: LinkState): Tier {
  switch (linkState) {
    case "linked-subscribed":
      return "pro";
    case "linked-free":
    case "unlinked":
      return "free";
  }
}

/**
 * The plan tier the portal runs on, self-hosted flavor: derived from whether the
 * org has linked its SaaS account and carries a live subscription. The SaaS
 * build shadows this file to derive the tier from the wallet instead — there is
 * no link concept there (see saas/portal/contexts/usePlanTier).
 */
export function usePlanTier(): Tier {
  const { linkState } = useLink();
  return tierFromLinkState(linkState);
}
