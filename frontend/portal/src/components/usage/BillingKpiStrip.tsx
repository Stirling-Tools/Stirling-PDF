import { useTranslation } from "react-i18next";
import { MetricCard, MetricStrip } from "@shared/components";
import { useTier } from "@portal/contexts/TierContext";
import { OVERAGE_RATE, type BillingSummary } from "@portal/api/usage";
import { USD, formatBillingDate } from "@portal/components/usage/format";
import "@portal/views/Usage.css";

/** Headline billing KPIs: docs processed, cost, the tier-relevant cap figure, and renewal. */
export function BillingKpiStrip({
  summary,
}: {
  summary: BillingSummary | null;
}) {
  const { t } = useTranslation();
  const { tier } = useTier();

  // Overage is meaningless on free (gated) / enterprise (committed) — surface
  // the more relevant headline figure for those tiers instead.
  const overageCard =
    tier === "free"
      ? {
          label: t("usage.kpi.remainingInPlan.label"),
          value: summary
            ? `${(summary.includedDocs - summary.docsThisPeriod).toLocaleString()}`
            : "—",
          description: t("usage.kpi.remainingInPlan.description"),
        }
      : tier === "enterprise"
        ? {
            label: t("usage.kpi.commitUtilisation.label"),
            value: summary
              ? `${Math.round((summary.docsThisPeriod / summary.includedDocs) * 100)}%`
              : "—",
            description: t("usage.kpi.commitUtilisation.description"),
          }
        : {
            label: t("usage.kpi.overage.label", {
              rate: OVERAGE_RATE.toFixed(2),
            }),
            value: summary ? USD.format(summary.overageCost) : "—",
            description: summary
              ? t("usage.kpi.overage.description", {
                  count: summary.overageDocs,
                  docs: summary.overageDocs.toLocaleString(),
                })
              : undefined,
          };

  return (
    <MetricStrip>
      <MetricCard
        label={t("usage.kpi.docsThisPeriod.label")}
        value={summary ? summary.docsThisPeriod.toLocaleString() : "—"}
        description={
          summary
            ? t("usage.kpi.docsThisPeriod.description", {
                included: summary.includedDocs.toLocaleString(),
              })
            : undefined
        }
      />
      <MetricCard
        label={t("usage.kpi.costThisMonth.label")}
        value={summary ? USD.format(summary.costThisMonth) : "—"}
        description={
          summary && summary.monthlyFee > 0
            ? t("usage.kpi.costThisMonth.description", {
                fee: USD.format(summary.monthlyFee),
              })
            : tier === "free"
              ? t("usage.kpi.costThisMonth.freePlan")
              : undefined
        }
      />
      <MetricCard
        label={overageCard.label}
        value={overageCard.value}
        description={overageCard.description}
      />
      <MetricCard
        label={t("usage.kpi.nextBillingDate.label")}
        value={summary ? formatBillingDate(summary.nextBillingDate) : "—"}
        description={
          tier === "free"
            ? t("usage.kpi.nextBillingDate.resetsMonthly")
            : t("usage.kpi.nextBillingDate.autoCharge")
        }
      />
    </MetricStrip>
  );
}
