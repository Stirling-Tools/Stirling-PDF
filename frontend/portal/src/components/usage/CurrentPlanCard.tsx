import { useTranslation } from "react-i18next";
import {
  Banner,
  Button,
  Card,
  ProgressBar,
  StatusBadge,
} from "@shared/components";
import { useTier } from "@portal/contexts/TierContext";
import { OVERAGE_RATE, type BillingSummary } from "@portal/api/usage";
import { USD } from "@portal/components/usage/format";
import "@portal/views/Usage.css";

function BreakdownRow({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={
        "portal-usage__breakdown-row" +
        (emphasis ? " portal-usage__breakdown-row--total" : "")
      }
    >
      <span className="portal-usage__breakdown-label">{label}</span>
      <span className="portal-usage__breakdown-value">{value}</span>
    </div>
  );
}

/**
 * Current-plan summary card. The body adapts per tier: a cap meter + nudge on
 * free, a metered pay-as-you-go breakdown on pro, a committed-volume breakdown
 * on enterprise.
 */
export function CurrentPlanCard({
  summary,
  onUpgrade,
}: {
  summary: BillingSummary;
  onUpgrade: () => void;
}) {
  const { t } = useTranslation();
  const { tier } = useTier();
  const usedRatio = summary.docsThisPeriod / summary.includedDocs;

  return (
    <Card padding="loose" className="portal-usage__plan-current">
      <div className="portal-usage__plan-current-head">
        <div>
          <span className="portal-usage__plan-eyebrow">
            {t("usage.currentPlan.eyebrow")}
          </span>
          <h2 className="portal-usage__plan-name">{summary.planName}</h2>
        </div>
        <StatusBadge
          tone={
            tier === "enterprise"
              ? "purple"
              : tier === "pro"
                ? "info"
                : "neutral"
          }
          size="sm"
        >
          {tier === "free"
            ? t("usage.currentPlan.badge.free")
            : tier === "pro"
              ? t("usage.currentPlan.badge.pro")
              : t("usage.currentPlan.badge.enterprise")}
        </StatusBadge>
      </div>

      {tier === "free" && (
        <>
          <div className="portal-usage__cap">
            <div className="portal-usage__cap-row">
              <span>
                {summary.docsThisPeriod.toLocaleString()} /{" "}
                {summary.includedDocs.toLocaleString()} docs
              </span>
              <span className="portal-usage__cap-pct">
                {Math.round(usedRatio * 100)}%
              </span>
            </div>
            <ProgressBar
              value={usedRatio}
              thresholded
              height={8}
              label={t("usage.currentPlan.free.progressLabel")}
            />
          </div>
          {summary.capReached ? (
            <Banner
              tone="danger"
              title={t("usage.currentPlan.free.capReached.title")}
            >
              {t("usage.currentPlan.free.capReached.body")}
            </Banner>
          ) : (
            <Banner
              tone="warning"
              title={t("usage.currentPlan.free.approaching.title")}
            >
              {t("usage.currentPlan.free.approaching.body", {
                pct: Math.round(usedRatio * 100),
              })}
            </Banner>
          )}
        </>
      )}

      {tier === "pro" && (
        <div className="portal-usage__breakdown">
          <BreakdownRow
            label={t("usage.currentPlan.pro.platformFee")}
            value={USD.format(summary.monthlyFee)}
          />
          <BreakdownRow
            label={t("usage.currentPlan.pro.includedDocs")}
            value={`${summary.includedDocs.toLocaleString()}`}
          />
          <BreakdownRow
            label={t("usage.currentPlan.pro.overage", {
              docs: summary.overageDocs.toLocaleString(),
              rate: OVERAGE_RATE.toFixed(2),
            })}
            value={USD.format(summary.overageCost)}
          />
          <BreakdownRow
            label={t("usage.currentPlan.pro.projected")}
            value={USD.format(summary.costThisMonth)}
            emphasis
          />
        </div>
      )}

      {tier === "enterprise" && (
        <div className="portal-usage__breakdown">
          <BreakdownRow
            label={t("usage.currentPlan.enterprise.committedVolume")}
            value={t("usage.currentPlan.enterprise.committedVolumeValue", {
              docs: summary.includedDocs.toLocaleString(),
            })}
          />
          <BreakdownRow
            label={t("usage.currentPlan.enterprise.drawnThisPeriod")}
            value={t("usage.currentPlan.enterprise.drawnThisPeriodValue", {
              docs: summary.docsThisPeriod.toLocaleString(),
            })}
          />
          <BreakdownRow
            label={t("usage.currentPlan.enterprise.effectiveRate")}
            value={t("usage.currentPlan.enterprise.effectiveRateValue", {
              rate: summary.overageRate.toFixed(3),
            })}
          />
          <BreakdownRow
            label={t("usage.currentPlan.enterprise.monthlyDraw")}
            value={USD.format(summary.monthlyFee)}
            emphasis
          />
        </div>
      )}

      <div className="portal-usage__plan-actions">
        {tier !== "enterprise" ? (
          <Button
            variant="gradient"
            accent={tier === "free" ? "blue" : "purple"}
            onClick={onUpgrade}
          >
            {tier === "free"
              ? t("usage.currentPlan.actions.upgrade")
              : t("usage.currentPlan.actions.talkToSales")}
          </Button>
        ) : (
          <Button variant="outline" accent="purple" onClick={onUpgrade}>
            {t("usage.currentPlan.actions.adjustCommitment")}
          </Button>
        )}
        {/* TODO(backend): GET /v1/billing/invoices?format=pdf — bundle + download invoice PDFs. */}
        <Button variant="ghost" size="md">
          {t("usage.currentPlan.actions.downloadInvoices")}
        </Button>
      </div>
    </Card>
  );
}
