import { useMemo } from "react";
import { useWallet } from "@app/hooks/useWallet";
import { type NavFooterCredits } from "@app/components/shared/navFooter/NavFooterCreditsRow";

/**
 * Cloud builds read the free grant straight off the live wallet — the same
 * snapshot the Plan page's free meter renders, so the sidebar and Plan can't
 * disagree. Null until the wallet loads (or if it fails), which keeps the
 * footer from flashing a placeholder figure the user might act on.
 */
export function useFreeCreditsSummary(): NavFooterCredits | null {
  const { wallet } = useWallet();
  return useMemo(
    () =>
      wallet
        ? { remaining: wallet.freeRemaining, total: wallet.freeAllowance }
        : null,
    [wallet],
  );
}
