import { useTranslation } from "react-i18next";
import { MetricCard, MetricStrip } from "@shared/components";
import type { PipelinesOverviewResponse } from "@portal/api/pipelines";

/**
 * KPI labels are product copy: they describe what each metric IS, not its value.
 * They stay client-side so the strip's structure is stable across loading / empty
 * / ready states; only values + descriptions flow from the API. Order matches
 * PolicyOverviewService.buildKpis: total, active, paused.
 */
const KPI_LABEL_KEYS = [
  "pipelines.kpi.total",
  "pipelines.kpi.active",
  "pipelines.kpi.paused",
] as const;

interface KpiStripProps {
  data: PipelinesOverviewResponse | null;
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
