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
  const { tier } = useTier();

  // Overage is meaningless on free (gated) / enterprise (committed) — surface
  // the more relevant headline figure for those tiers instead.
  const overageCard =
    tier === "free"
      ? {
          label: "Remaining in plan",
          value: summary
            ? `${(summary.includedDocs - summary.docsThisPeriod).toLocaleString()}`
            : "—",
          description: "docs before cap",
        }
      : tier === "enterprise"
        ? {
            label: "Commit utilisation",
            value: summary
              ? `${Math.round((summary.docsThisPeriod / summary.includedDocs) * 100)}%`
              : "—",
            description: "of committed volume",
          }
        : {
            label: `Overage ($${OVERAGE_RATE.toFixed(2)}/doc)`,
            value: summary ? USD.format(summary.overageCost) : "—",
            description: summary
              ? `${summary.overageDocs.toLocaleString()} docs past cap`
              : undefined,
          };

  return (
    <MetricStrip>
      <MetricCard
        label="Docs this period"
        value={summary ? summary.docsThisPeriod.toLocaleString() : "—"}
        description={
          summary
            ? `of ${summary.includedDocs.toLocaleString()} included`
            : undefined
        }
      />
      <MetricCard
        label="Cost this month"
        value={summary ? USD.format(summary.costThisMonth) : "—"}
        description={
          summary && summary.monthlyFee > 0
            ? `incl. ${USD.format(summary.monthlyFee)} platform`
            : tier === "free"
              ? "free plan"
              : undefined
        }
      />
      <MetricCard
        label={overageCard.label}
        value={overageCard.value}
        description={overageCard.description}
      />
      <MetricCard
        label="Next billing date"
        value={summary ? formatBillingDate(summary.nextBillingDate) : "—"}
        description={tier === "free" ? "resets monthly" : "auto-charge"}
      />
    </MetricStrip>
  );
}
