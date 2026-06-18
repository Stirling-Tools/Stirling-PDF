import { MetricCard, MetricStrip } from "@shared/components";
import type { ComponentsResponse } from "@portal/api/sdkComponents";

/**
 * Labels are product copy — they describe what each metric IS, not its value,
 * so the strip's structure stays stable across loading / empty / ready states.
 * Only values flow from the API.
 */
const KPI_LABELS = [
  "Components GA",
  "In beta",
  "Embeds this month",
  "Component spend (MTD)",
] as const;

interface ComponentsSummaryStripProps {
  data: ComponentsResponse | null;
  loading: boolean;
}

export function ComponentsSummaryStrip({
  data,
  loading,
}: ComponentsSummaryStripProps) {
  const s = loading ? undefined : data?.summary;
  const values: (string | number)[] = [
    s?.gaCount ?? "—",
    s?.betaCount ?? "—",
    s ? s.embedsThisMonth.toLocaleString() : "—",
    s ? `$${s.spendThisMonth.toLocaleString()}` : "—",
  ];

  return (
    <MetricStrip>
      {KPI_LABELS.map((label, i) => (
        <MetricCard key={label} label={label} value={values[i]} />
      ))}
    </MetricStrip>
  );
}
