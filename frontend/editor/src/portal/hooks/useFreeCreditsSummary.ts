import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLink } from "@portal/contexts/LinkContext";
import { walletQuery } from "@portal/queries/wallet";
import {
  readCachedCredits,
  writeCachedCredits,
  type CachedCredits,
} from "@app/services/navFooterCache";
import { type NavFooterCredits } from "@app/components/shared/navFooter/NavFooterCreditsRow";

/**
 * Free credits left on this team's allowance, for the processor's sidebar
 * footer meter. Null hides the meter.
 *
 * This is the portal's own seam rather than the editor's {@code
 * @app/hooks/useFreeCreditsSummary}, because self-hosted resolves {@code @app/*}
 * as proprietary → core: the cloud wallet hook isn't in that cascade, and the
 * implementation can't move down into proprietary either, since core/desktop
 * builds ship no portal and must never resolve {@code @portal}. Keeping it here
 * means only builds that actually have a processor pull in the wallet read.
 *
 * Self-hosted reads the same {@code GET /api/v1/payg/wallet} the Usage page's
 * trial meter renders — {@code apiClient.saas} with the admin's Supabase JWT,
 * since the wallet lives in the cloud even when the instance doesn't. Gated on
 * linkage: an unlinked instance has no wallet to read.
 *
 * Free teams only, matching the editor and the Plan page: a payer's headline
 * number is spend against cap, and their usage lives on Usage & Billing.
 */
export function useFreeCreditsSummary(): NavFooterCredits | null {
  const { isLinked } = useLink();
  // Shared definition, not just a shared key: per-observer options are resolved
  // per-observer, so differing retry or interval settings here would make the
  // behaviour depend on which reader happened to fetch.
  const { data: wallet } = useQuery(walletQuery(isLinked));
  // Shared with the editor's seam, so crossing between the two apps shows the
  // figures the other one last saw rather than re-fetching into an empty row.
  const [seed] = useState(readCachedCredits);

  const live: CachedCredits | undefined = !wallet
    ? undefined
    : wallet.status === "subscribed"
      ? null
      : { remaining: wallet.freeRemaining, total: wallet.freeAllowance };

  useEffect(() => {
    // Only once linked: an unlinked instance never asks, so it has no answer of
    // its own and must not overwrite what the editor recorded.
    if (isLinked && live !== undefined) writeCachedCredits(live);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet, isLinked]);

  // Linkage gates the seed as well as the fetch. The cache outlives an unlink
  // — nothing refetches or rewrites it once the instance stops asking — so
  // without this an unlinked instance would keep showing the figures from when
  // it was linked, indefinitely.
  if (!isLinked) return null;
  return (live !== undefined ? live : seed) ?? null;
}
