import { useTranslation } from "react-i18next";
import { Button, Skeleton } from "@app/ui";
import { TIER_INFO, useTier } from "@portal/contexts/TierContext";
import { useView } from "@portal/contexts/ViewContext";
import { useAsync } from "@portal/hooks/useAsync";
import { fetchFleetStats, type FleetStats } from "@portal/api/fleetStats";
import "@portal/components/ProcessingStatusStrip.css";

/**
 * A thin one-line header above the home content: current plan + the real 30-day
 * processed-PDF volume (from the fleet-usage endpoint), with a shortcut to the
 * Usage page. Renders "—" while loading or when the backend can't compute the
 * figure (e.g. EE auditing disabled) — never a fabricated number.
 */
export function ProcessingStatusStrip() {
  const { t } = useTranslation();
  const { tier } = useTier();
  const { setActiveView } = useView();
  const { data, loading } = useAsync<FleetStats>(() => fetchFleetStats(), []);

  return (
    <div className="portal-statusstrip portal-statusstrip--paid">
      <span className="portal-statusstrip__plan">
        <span
          className="portal-statusstrip__dot"
          style={{ background: TIER_INFO[tier].dotColor }}
          aria-hidden
        />
        {TIER_INFO[tier].label}
      </span>
      <span className="portal-statusstrip__sep" aria-hidden>
        ·
      </span>
      <span className="portal-statusstrip__volume">
        {loading ? (
          <Skeleton width="3rem" height="0.875rem" />
        ) : (
          <strong>{data?.pdfsProcessed?.toLocaleString() ?? "—"}</strong>
        )}{" "}
        {t("portal.processingStatus.volumeSuffix")}
      </span>
      <Button
        size="sm"
        variant="tertiary"
        className="portal-statusstrip__manage"
        onClick={() => setActiveView("usage")}
      >
        {t("portal.processingStatus.managePlan")}
      </Button>
    </div>
  );
}
