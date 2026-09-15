import { useEffect, useState } from "react";
import { useWallet } from "@app/hooks/useWallet";
import {
  readCachedCredits,
  writeCachedCredits,
  type CachedCredits,
} from "@app/services/navFooterCache";
import { type NavFooterCredits } from "@app/components/shared/navFooter/NavFooterCreditsRow";

/** The wallet reduced to what the footer shows: figures, or null for a payer. */
function toCredits(
  status: string,
  freeRemaining: number,
  freeAllowance: number,
): CachedCredits {
  // Free teams only: a payer's headline number is spend against cap, and a
  // draining free meter beside a live invoice reads as a problem.
  if (status === "subscribed") return null;
  return { remaining: freeRemaining, total: freeAllowance };
}

/**
 * Cloud builds read the free grant off the live wallet — the same snapshot the
 * Plan page's free meter renders, so the sidebar and Plan can't disagree.
 *
 * Seeded from the last figures this browser saw, so the row is right at first
 * paint and stays put while the wallet refetches underneath. Only a browser
 * that has never loaded a wallet has nothing to show, and that one time the row
 * animates in. The seed is read once, at first render: later reads would fight
 * the live value, and the whole point is that the row stops moving.
 */
export function useFreeCreditsSummary(): NavFooterCredits | null {
  const { wallet } = useWallet();
  const [seed] = useState(readCachedCredits);

  const live = wallet
    ? toCredits(wallet.status, wallet.freeRemaining, wallet.freeAllowance)
    : undefined;

  // useWallet reuses the snapshot reference when nothing changed, so keying on
  // it writes only on a real change, not on every render.
  useEffect(() => {
    if (live !== undefined) writeCachedCredits(live);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet]);

  return (live !== undefined ? live : seed) ?? null;
}
