import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState, Skeleton } from "@shared/components";
import { useAsync, useSectionFlags } from "@portal/hooks/useAsync";
import { fetchBillingUsage, type UsageSeriesResponse } from "@portal/api/usage";
import { UsageAreaChart } from "@portal/components/UsageAreaChart";
import "@portal/components/UsageAreaChart.css";

/** 30-day docs-processed area chart, with the period total and prior-period delta. */
export function UsageChart() {
  const { t } = useTranslation();
  const state = useAsync<UsageSeriesResponse>(() => fetchBillingUsage(), []);
  const { data: usage } = state;
  const { isLoading } = useSectionFlags(state);

  const docs30d = useMemo(
    () => usage?.points.reduce((sum, p) => sum + p.value, 0) ?? 0,
    [usage],
  );
  const deltaPct = useMemo(() => {
    if (!usage || usage.priorTotal <= 0) return undefined;
    return (docs30d - usage.priorTotal) / usage.priorTotal;
  }, [usage, docs30d]);

  if (isLoading) {
    return (
      <div className="portal-chart">
        <Skeleton width="12rem" height="0.875rem" />
        <Skeleton width="7rem" height="1.75rem" />
        <Skeleton height="15rem" />
      </div>
    );
  }

  if (!usage || usage.points.length === 0) {
    return (
      <EmptyState
        title={t("usage.chart.empty.title")}
        description={t("usage.chart.empty.description")}
      />
    );
  }

  return (
    <UsageAreaChart
      data={usage.points}
      totalValue={docs30d.toLocaleString()}
      deltaPct={deltaPct}
    />
  );
}
