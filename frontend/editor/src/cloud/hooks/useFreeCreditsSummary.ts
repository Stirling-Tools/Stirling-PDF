import { useEffect, useState } from "react";
import { useWallet } from "@app/hooks/useWallet";
import { useAuth } from "@app/auth/UseSession";
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
 * Cached figures are read once and shown only after authentication resolves.
 * Live wallet data takes precedence. Guest sessions discard the seed as well
 * as the stored cache so signup cannot revive a previous account's figures.
 */
export function useFreeCreditsSummary(): NavFooterCredits | null {
  const { isAnonymous, loading } = useAuth();
  const { wallet } = useWallet(!loading && !isAnonymous);
  const [seed, setSeed] = useState(() =>
    isAnonymous ? null : readCachedCredits(),
  );

  const live = wallet
    ? toCredits(wallet.status, wallet.freeRemaining, wallet.freeAllowance)
    : undefined;

  // useWallet reuses the snapshot reference when nothing changed, so keying on
  // it writes only on a real change, not on every render.
  useEffect(() => {
    if (isAnonymous) {
      setSeed(null);
      writeCachedCredits(null);
    } else if (live !== undefined) writeCachedCredits(live);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet, isAnonymous]);

  if (loading || isAnonymous) return null;
  return (live !== undefined ? live : seed) ?? null;
}
