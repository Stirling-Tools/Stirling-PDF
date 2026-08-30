import { useEffect, useState } from "react";
import { useWallet, type UseWalletOptions } from "@app/hooks/useWallet";
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
  // Free teams only. The grant is a lifetime pool that survives subscribing, so
  // a paying team would otherwise sit on a permanent "0 of 500" in red while
  // nothing is wrong. Plan draws the same line — subscribed teams get the
  // spend-vs-cap meter there, and admins get usage in the processor.
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
export function useFreeCreditsSummary(
  options?: UseWalletOptions,
): NavFooterCredits | null {
  const enabled = options?.enabled ?? true;
  const { wallet } = useWallet({ enabled });
  const [seed] = useState(readCachedCredits);

  const live = wallet
    ? toCredits(wallet.status, wallet.freeRemaining, wallet.freeAllowance)
    : undefined;

  // useWallet reuses the snapshot reference when nothing changed, so keying on
  // it writes only on a real change, not on every render.
  useEffect(() => {
    if (enabled && live !== undefined) writeCachedCredits(live);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, wallet]);

  // Disabled gates the seed as well as the fetch, the way the portal gates both on linkage: the
  // cache outlives the build that wrote it, so a desktop that once ran against the cloud would
  // otherwise keep showing that session's figures with nothing left to refresh them.
  if (!enabled) return null;
  return (live !== undefined ? live : seed) ?? null;
}
