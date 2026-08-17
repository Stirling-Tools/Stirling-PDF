import { type NavFooterCredits } from "@app/components/shared/navFooter/NavFooterCreditsRow";

/**
 * Free credits left on this team's allowance, for the sidebar footer meter.
 * Null hides the meter entirely.
 *
 * Core has no wallet — self-hosted installs aren't metered — so there is
 * nothing to show. Cloud builds override this with the live wallet figure.
 */
export function useFreeCreditsSummary(): NavFooterCredits | null {
  return null;
}
