import { useMemo } from "react";
import { useWallet } from "@app/hooks/useWallet";
import { type NavFooterCredits } from "@app/components/shared/navFooter/NavFooterCreditsRow";

/**
 * Cloud builds read the free grant straight off the live wallet — the same
 * snapshot the Plan page's free meter renders, so the sidebar and Plan can't
 * disagree. Null until the wallet loads (or if it fails), which keeps the
 * footer from flashing a placeholder figure the user might act on.
 *
 * Free teams only. The grant is a lifetime pool that survives subscribing, so a
 * paying team would otherwise sit on a permanent "0 of 500" in red while
 * nothing is actually wrong. Plan draws the same line — subscribed teams get
 * the spend-vs-cap meter there, and admins get usage in the processor.
 */
export function useFreeCreditsSummary(): NavFooterCredits | null {
  const { wallet } = useWallet();
  return useMemo(
    () =>
      wallet && wallet.status !== "subscribed"
        ? { remaining: wallet.freeRemaining, total: wallet.freeAllowance }
        : null,
    [wallet],
  );
}
