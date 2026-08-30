import { useFreeCreditsSummary as useCloudFreeCreditsSummary } from "@cloud/hooks/useFreeCreditsSummary";
import { useConfirmedSaaSMode } from "@app/hooks/useConfirmedSaaSMode";
import { type NavFooterCredits } from "@app/components/shared/navFooter/NavFooterCreditsRow";

/**
 * Free credits for the sidebar footer meter, read only when this desktop is signed in to Stirling
 * Cloud. The wallet lives in the cloud even when the instance does not, so neither a local install
 * nor a self-hosted server can answer for it — and the installer's own backend serves no
 * {@code /api/v1/payg} route at all.
 *
 * Desktop needs its own seam because {@code @app/*} resolves desktop → cloud → proprietary → core:
 * without one, every desktop build inherits the cloud reader and a local install asks the bundled
 * backend for a wallet on mount and again every poll.
 */
export function useFreeCreditsSummary(): NavFooterCredits | null {
  const isSaaSMode = useConfirmedSaaSMode();
  return useCloudFreeCreditsSummary({ enabled: isSaaSMode });
}
