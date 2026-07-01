import { MetricCard, MetricStrip, Skeleton } from "@shared/components";
import type { DeploymentSummary } from "@portal/api/editorDeploy";

interface Props {
  summary?: DeploymentSummary;
  loading?: boolean;
}

/** Top-of-page metric strip summarising the org's Editor deployment health. */
export function DeploymentSummaryStrip({ summary, loading }: Props) {
  if (loading || !summary) {
    return (
      <MetricStrip>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} height="5.5rem" />
        ))}
      </MetricStrip>
    );
  }

  return (
    <MetricStrip>
      {summary.metrics.map((m) => (
        <MetricCard
          key={m.label}
          label={m.label}
          value={m.value}
          delta={m.delta}
          deltaDirection={m.deltaDirection}
          description={m.description}
        />
      ))}
    </MetricStrip>
  );
}
