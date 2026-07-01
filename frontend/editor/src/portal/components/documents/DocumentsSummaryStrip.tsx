import { useTranslation } from "react-i18next";
import { MetricCard, MetricStrip, Skeleton } from "@shared/components";
import type { DocumentsSummary } from "@portal/api/documents";
import { confidencePct } from "@portal/components/documents/format";

interface DocumentsSummaryStripProps {
  summary: DocumentsSummary | null;
  loading: boolean;
}

/** KPI strip across the top of the review queue. */
export function DocumentsSummaryStrip({
  summary,
  loading,
}: DocumentsSummaryStripProps) {
  const { t } = useTranslation();
  if (loading && !summary) {
    return (
      <MetricStrip>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} height="5.5rem" />
        ))}
      </MetricStrip>
    );
  }
  if (!summary) return null;

  return (
    <MetricStrip>
      <MetricCard
        label={t("documents.summary.inQueue")}
        value={summary.totalInQueue.toLocaleString()}
      />
      <MetricCard
        label={t("documents.summary.needsReview")}
        value={summary.needsReview.toLocaleString()}
      />
      <MetricCard
        label={t("documents.summary.avgConfidence")}
        value={confidencePct(summary.avgConfidence)}
      />
      <MetricCard
        label={t("documents.summary.processedToday")}
        value={summary.processedToday.toLocaleString()}
      />
    </MetricStrip>
  );
}
