import { useTranslation } from "react-i18next";
import { StatBar, StatBarItem } from "@app/ui";
import type { PoliciesResponse } from "@portal/api/policies";

interface CatalogueSummaryProps {
  data: PoliciesResponse | null;
  loading: boolean;
}

/**
 * Toned-down facts bar above the catalogue (was a row of metric boxes).
 * Labels are product copy (they describe what each metric is, not its value)
 * so the strip's structure stays stable across loading / ready states; only
 * the values flow from the API.
 */
export function CatalogueSummary({ data, loading }: CatalogueSummaryProps) {
  const { t } = useTranslation();
  const s = loading ? undefined : data?.summary;
  return (
    <StatBar>
      <StatBarItem
        emphasis
        title={t("portal.policies.summary.active.description")}
      >
        {s ? s.active : "—"} {t("portal.policies.summary.active.label")}
      </StatBarItem>
      <StatBarItem title={t("portal.policies.summary.paused.description")}>
        {s ? s.paused : "—"} {t("portal.policies.summary.paused.label")}
      </StatBarItem>
      <StatBarItem title={t("portal.policies.summary.categories.description")}>
        {s ? s.categories : "—"} {t("portal.policies.summary.categories.label")}
      </StatBarItem>
      <StatBarItem
        title={t("portal.policies.summary.docsEnforced.description")}
      >
        {s ? s.docsEnforced.toLocaleString() : "—"}{" "}
        {t("portal.policies.summary.docsEnforced.label")}
      </StatBarItem>
    </StatBar>
  );
}
