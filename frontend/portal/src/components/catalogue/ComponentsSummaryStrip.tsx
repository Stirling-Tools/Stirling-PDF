import { useTranslation } from "react-i18next";
import { MetricCard, MetricStrip } from "@shared/components";
import type { ComponentsResponse } from "@portal/api/sdkComponents";

/**
 * Labels are product copy — they describe what each metric IS, not its value,
 * so the strip's structure stays stable across loading / empty / ready states.
 * Only values flow from the API.
 */
const KPI_LABEL_KEYS = [
  "catalogue.summary.componentsGa",
  "catalogue.summary.inBeta",
  "catalogue.summary.embedsThisMonth",
  "catalogue.summary.componentSpendMtd",
] as const;

interface ComponentsSummaryStripProps {
  data: ComponentsResponse | null;
  loading: boolean;
}

export function ComponentsSummaryStrip({
  data,
  loading,
}: ComponentsSummaryStripProps) {
  const { t } = useTranslation();
  const s = loading ? undefined : data?.summary;
  const values: (string | number)[] = [
    s?.gaCount ?? "—",
    s?.betaCount ?? "—",
    s ? s.embedsThisMonth.toLocaleString() : "—",
    s ? `$${s.spendThisMonth.toLocaleString()}` : "—",
  ];

  return (
    <MetricStrip>
      {KPI_LABEL_KEYS.map((labelKey, i) => (
        <MetricCard key={labelKey} label={t(labelKey)} value={values[i]} />
      ))}
    </MetricStrip>
  );
}
