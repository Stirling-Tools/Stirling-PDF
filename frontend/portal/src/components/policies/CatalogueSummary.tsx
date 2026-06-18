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
  const s = loading ? undefined : data?.summary;
  return (
    <MetricStrip>
      <MetricCard
        label="Active policies"
        value={s ? s.active : "—"}
        description="Enforcing on upload/export"
      />
      <MetricCard
        label="Paused"
        value={s ? s.paused : "—"}
        description="Configured but not firing"
      />
      <MetricCard
        label="Categories"
        value={s ? s.categories : "—"}
        description="Available to configure"
      />
      <MetricCard
        label="Docs enforced"
        value={s ? s.docsEnforced.toLocaleString() : "—"}
        description="Across active policies"
      />
    </MetricStrip>
  );
}
