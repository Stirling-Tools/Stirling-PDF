import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Card,
  ProgressBar,
  Slider,
  StatusBadge,
} from "@shared/components";
import { useTier } from "@portal/contexts/TierContext";
import type { BillingSummary } from "@portal/api/usage";
import { USD } from "@portal/components/usage/format";
import "@portal/views/Usage.css";

/**
 * Monthly spend-cap control. Only pay-as-you-go can accrue spend, so free and
 * enterprise render explanatory cards instead of the interactive slider.
 */
export function SpendCapControl({ summary }: { summary: BillingSummary }) {
  const { t } = useTranslation();
  const { tier } = useTier();
  const [enabled, setEnabled] = useState(summary.spendCap !== null);
  const [cap, setCap] = useState(summary.spendCap ?? 1_000);

  if (tier === "free") {
    return (
      <Card padding="loose" className="portal-usage__cap-card">
        <h2 className="portal-usage__section-title">
          {t("usage.spendCap.free.title")}
        </h2>
        <p className="portal-usage__section-sub">
          {t("usage.spendCap.free.description")}
        </p>
      </Card>
    );
  }

  if (tier === "enterprise") {
    return (
      <Card padding="loose" className="portal-usage__cap-card">
        <h2 className="portal-usage__section-title">
          {t("usage.spendCap.enterprise.title")}
        </h2>
        <p className="portal-usage__section-sub">
          {t("usage.spendCap.enterprise.description")}
        </p>
        <div className="portal-usage__cap-meta">
          <StatusBadge tone="purple" size="sm">
            {t("usage.spendCap.enterprise.badge")}
          </StatusBadge>
          <span>
            {t("usage.spendCap.enterprise.overage", {
              rate: summary.overageRate.toFixed(3),
            })}
          </span>
        </div>
      </Card>
    );
  }

  const projected = summary.costThisMonth;
  const capRatio = enabled ? Math.min(projected / cap, 1) : 0;

  // TODO(backend): PUT /v1/billing/spend-cap { enabled, cap } — persist the cap
  // so processing pauses server-side when projected spend reaches the limit.
  return (
    <Card padding="loose" className="portal-usage__cap-card">
      <div className="portal-usage__cap-card-head">
        <div>
          <h2 className="portal-usage__section-title">
            {t("usage.spendCap.pro.title")}
          </h2>
          <p className="portal-usage__section-sub">
            {t("usage.spendCap.pro.subtitle")}
          </p>
        </div>
        <Button
          variant={enabled ? "outline" : "gradient"}
          size="sm"
          onClick={() => setEnabled((v) => !v)}
        >
          {enabled
            ? t("usage.spendCap.pro.disable")
            : t("usage.spendCap.pro.enable")}
        </Button>
      </div>

      {enabled && (
        <>
          <div className="portal-usage__cap-slider">
            <Slider
              value={cap}
              min={500}
              max={10_000}
              step={250}
              onChange={setCap}
              formatValue={(v) => USD.format(v)}
            />
          </div>
          <div className="portal-usage__cap-row">
            <span>
              {t("usage.spendCap.pro.projected", {
                projected: USD.format(projected),
                cap: USD.format(cap),
              })}
            </span>
            <span className="portal-usage__cap-pct">
              {Math.round(capRatio * 100)}%
            </span>
          </div>
          <ProgressBar
            value={capRatio}
            thresholded
            height={8}
            label={t("usage.spendCap.pro.progressLabel")}
          />
        </>
      )}
    </Card>
  );
}
