import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLink } from "@portal/contexts/LinkContext";
import { fetchWallet } from "@portal/api/billing";
import { qk } from "@portal/queries/keys";
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
 * Free teams only, matching the editor and the Plan page. The grant is a
 * lifetime pool that survives subscribing, so a paying team would otherwise sit
 * on a permanent "0 of 500" in red; their usage lives on Usage & Billing.
 */
export function useFreeCreditsSummary(): NavFooterCredits | null {
  const { isLinked } = useLink();
  // Shared query key, so the footer rides the same cached snapshot as any other
  // wallet reader rather than adding a fetch per mount.
  const { data: wallet } = useQuery({
    queryKey: qk.wallet(isLinked),
    queryFn: fetchWallet,
    enabled: isLinked,
  });
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

  return (live !== undefined ? live : seed) ?? null;
}
