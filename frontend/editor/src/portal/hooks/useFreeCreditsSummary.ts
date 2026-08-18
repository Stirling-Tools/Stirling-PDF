import { useQuery } from "@tanstack/react-query";
import { useLink } from "@portal/contexts/LinkContext";
import { fetchWallet } from "@portal/api/billing";
import { qk } from "@portal/queries/keys";
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
  const { data: wallet, isPending } = useQuery({
    queryKey: qk.wallet(isLinked),
    queryFn: fetchWallet,
    enabled: isLinked,
  });
  // Linkage is known synchronously, so a linked instance can hold the row's
  // space while the wallet loads without needing a remembered hint.
  if (!wallet) return isLinked && isPending ? { state: "loading" } : null;
  if (wallet.status === "subscribed") return null;
  return {
    state: "ready",
    remaining: wallet.freeRemaining,
    total: wallet.freeAllowance,
  };
}
