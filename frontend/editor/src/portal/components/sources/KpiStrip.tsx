import { useTranslation } from "react-i18next";
import { MetricCard, MetricStrip } from "@shared/components";
import type { SourcesResponse } from "@portal/api/sources";

/**
 * KPI labels are product copy: they describe what each metric IS, not its
 * current value. They stay client-side so the strip's structure is stable across
 * loading / empty / ready states; only values + descriptions flow from the API.
 * Order matches SourceOverviewService.buildKpis: total, in-use, unused.
 */
const KPI_LABEL_KEYS = [
  "sources.kpi.total",
  "sources.kpi.inUse",
  "sources.kpi.unused",
] as const;

interface KpiStripProps {
  data: SourcesResponse | null;
  loading: boolean;
}

export function KpiStrip({ data, loading }: KpiStripProps) {
  const { t } = useTranslation();
  return (
    <MetricStrip>
      {KPI_LABEL_KEYS.map((labelKey, i) => {
        const k = loading ? undefined : data?.kpis[i];
        return (
          <MetricCard
            key={labelKey}
            label={t(labelKey)}
            value={k?.value ?? "—"}
            description={k?.description}
          />
        );
      })}
    </MetricStrip>
  );
}
