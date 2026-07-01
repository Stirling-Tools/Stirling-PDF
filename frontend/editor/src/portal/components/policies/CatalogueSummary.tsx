import { useTranslation } from "react-i18next";
import { MetricCard, MetricStrip } from "@shared/components";
import type { PoliciesResponse } from "@portal/api/policies";

interface CatalogueSummaryProps {
  data: PoliciesResponse | null;
  loading: boolean;
}

/**
 * Summary strip above the catalogue. Labels are product copy (they describe
 * what each metric is, not its value) so the strip's structure stays stable
 * across loading / ready states; only the values flow from the API.
 */
export function CatalogueSummary({ data, loading }: CatalogueSummaryProps) {
  const { t } = useTranslation();
  const s = loading ? undefined : data?.summary;
  return (
    <MetricStrip>
      <MetricCard
        label={t("policies.summary.active.label")}
        value={s ? s.active : "—"}
        description={t("policies.summary.active.description")}
      />
      <MetricCard
        label={t("policies.summary.paused.label")}
        value={s ? s.paused : "—"}
        description={t("policies.summary.paused.description")}
      />
      <MetricCard
        label={t("policies.summary.categories.label")}
        value={s ? s.categories : "—"}
        description={t("policies.summary.categories.description")}
      />
      <MetricCard
        label={t("policies.summary.docsEnforced.label")}
        value={s ? s.docsEnforced.toLocaleString() : "—"}
        description={t("policies.summary.docsEnforced.description")}
      />
    </MetricStrip>
  );
}
