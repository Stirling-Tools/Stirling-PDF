import { useEffect, useMemo } from "react";
import { useWallet } from "@app/hooks/useWallet";
import {
  readWalletIsMetered,
  writeWalletIsMetered,
} from "@app/services/walletPlanHint";
import { type NavFooterCredits } from "@app/components/shared/navFooter/NavFooterCreditsRow";

/**
 * Cloud builds read the free grant straight off the live wallet — the same
 * snapshot the Plan page's free meter renders, so the sidebar and Plan can't
 * disagree.
 *
 * Free teams only. The grant is a lifetime pool that survives subscribing, so a
 * paying team would otherwise sit on a permanent "0 of 500" in red while
 * nothing is actually wrong. Plan draws the same line — subscribed teams get
 * the spend-vs-cap meter there, and admins get usage in the processor.
 *
 * Before the wallet answers, the last known plan decides whether the row holds
 * its space (see {@link readWalletIsMetered}): a free team gets the row with a
 * spinner where the figures go, a paying team gets nothing, and a browser that
 * has never loaded a wallet waits rather than guessing. The figures themselves
 * are never persisted — a credit balance shown from storage would be wrong the
 * moment anything ran.
 */
export function useFreeCreditsSummary(): NavFooterCredits | null {
  const { wallet } = useWallet();
  const metered = wallet ? wallet.status === "subscribed" : null;

  useEffect(() => {
    if (metered !== null) writeWalletIsMetered(metered);
  }, [metered]);

  return useMemo(() => {
    if (!wallet) {
      // No wallet yet: hold the space only if this browser last saw a free team.
      return readWalletIsMetered() === false ? { state: "loading" } : null;
    }
    if (wallet.status === "subscribed") return null;
    return {
      state: "ready",
      remaining: wallet.freeRemaining,
      total: wallet.freeAllowance,
    };
  }, [wallet]);
}
