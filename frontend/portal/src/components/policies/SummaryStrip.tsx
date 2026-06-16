import { MetricCard, MetricStrip } from "@shared/components";
import type { PoliciesResponse } from "@portal/api/policies";

/**
 * Labels are product copy — they describe what each metric IS, not its current
 * value. They stay client-side so the strip's structure is stable across
 * loading / empty / ready states; only values flow from the API.
 */
const SUMMARY_LABELS = [
  "Active policies",
  "Doc-types covered",
  "Last change",
] as const;

interface SummaryStripProps {
  data: PoliciesResponse | null;
  loading: boolean;
}

export function SummaryStrip({ data, loading }: SummaryStripProps) {
  const s = loading ? undefined : data?.summary;
  const values = [
    s ? `${s.activePolicies} / ${s.totalCategories}` : "—",
    s ? s.docTypesCovered : "—",
    s ? s.lastChange : "—",
  ];
  const descriptions = [
    "Categories enabled",
    "Across all overrides",
    s ? `by ${s.lastChangeBy}` : undefined,
  ];

  return (
    <MetricStrip>
      {SUMMARY_LABELS.map((label, i) => (
        <MetricCard
          key={label}
          label={label}
          value={values[i]}
          description={descriptions[i]}
        />
      ))}
    </MetricStrip>
  );
}
