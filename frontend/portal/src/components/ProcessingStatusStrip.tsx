import { useTranslation } from "react-i18next";
import { Banner, Button, ProgressBar, Skeleton } from "@shared/components";
import { TIER_INFO, useTier } from "@portal/contexts/TierContext";
import { useView } from "@portal/contexts/ViewContext";
import { useAsync } from "@portal/hooks/useAsync";
import { fetchHomeKpis, type KpiEntry } from "@portal/api/home";
import "@portal/components/ProcessingStatusStrip.css";

/**
 * Parses the free-tier "used / cap" KPI string (e.g. "247 / 500") into its
 * parts. The free meter is the headline KPI value rather than a separate
 * endpoint, so the strip reads it from the same `fetchHomeKpis` payload the
 * KPI cards use — no duplicate fetch, no second source of truth.
 */
function parseUsage(value: KpiEntry["value"]): {
  used: number;
  cap: number;
} | null {
  const match = String(value).match(/([\d,]+)\s*\/\s*([\d,]+)/);
  if (!match) return null;
  const used = Number(match[1].replace(/,/g, ""));
  const cap = Number(match[2].replace(/,/g, ""));
  if (!Number.isFinite(used) || !Number.isFinite(cap) || cap <= 0) return null;
  return { used, cap };
}

export function ProcessingStatusStrip() {
  const { t } = useTranslation();
  const { tier } = useTier();
  const { setActiveView } = useView();
  const { data: kpis, loading } = useAsync<KpiEntry[]>(
    () => fetchHomeKpis(tier),
    [tier],
  );

  if (loading) {
    return (
      <div className="portal-statusstrip" aria-busy>
        <Skeleton width="9rem" height="0.875rem" />
        <Skeleton height="0.5rem" />
      </div>
    );
  }

  if (tier === "free") {
    const usage = parseUsage(kpis?.[0]?.value ?? "");
    const used = usage?.used ?? 0;
    const cap = usage?.cap ?? 500;
    const ratio = cap > 0 ? used / cap : 0;
    const nearCap = ratio >= 0.8;

    return (
      <Banner
        tone={nearCap ? "warning" : "neutral"}
        className="portal-statusstrip portal-statusstrip--free"
        action={
          nearCap ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setActiveView("usage")}
            >
              {t("processingStatus.upgrade")}
            </Button>
          ) : undefined
        }
      >
        <div className="portal-statusstrip__free-row">
          <span className="portal-statusstrip__free-label">
            <strong>{used.toLocaleString()}</strong> / {cap.toLocaleString()}{" "}
            {t("processingStatus.pdfsThisMonth")}
          </span>
          <span className="portal-statusstrip__free-pct">
            {Math.round(ratio * 100)}%
          </span>
        </div>
        <ProgressBar
          value={ratio}
          thresholded
          label={t("processingStatus.progressLabel", { used, cap })}
        />
      </Banner>
    );
  }

  // Pro / enterprise: plan name + headline volume from the first KPI.
  const volume = kpis?.[0]?.value;
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
        <strong>{volume ?? "—"}</strong> {t("processingStatus.volumeSuffix")}
      </span>
      <Button
        size="sm"
        variant="ghost"
        className="portal-statusstrip__manage"
        onClick={() => setActiveView("usage")}
      >
        {t("processingStatus.managePlan")}
      </Button>
    </div>
  );
}
