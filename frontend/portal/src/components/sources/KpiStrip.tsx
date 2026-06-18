import { MetricCard, MetricStrip } from "@shared/components";
import type { SourcesResponse } from "@portal/api/sources";

/**
 * KPI labels are product copy — they describe what each metric IS, not its
 * current value. They stay client-side so the strip's structure is stable
 * across loading / empty / ready states; only values + deltas flow from the API.
 */
const KPI_LABELS = [
  "Agents active",
  "Scenarios",
  "Eval pass rate (7d)",
  "Docs / 24h",
] as const;

interface KpiStripProps {
  data: SourcesResponse | null;
  loading: boolean;
}

export function KpiStrip({ data, loading }: KpiStripProps) {
  return (
    <MetricStrip>
      {KPI_LABELS.map((label, i) => {
        const k = loading ? undefined : data?.kpis[i];
        return (
          <MetricCard
            key={label}
            label={label}
            value={k?.value ?? "—"}
            delta={k?.delta}
            deltaDirection={k?.deltaDirection}
            description={k?.description}
          />
        );
      })}
    </MetricStrip>
  );
}
