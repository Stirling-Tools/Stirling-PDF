import { MetricCard, MetricStrip, Skeleton } from "@app/ui";
import { EditorIcon } from "@processor/components/icons";
import type { DeploymentSummary } from "@processor/api/editorDeploy";

interface Props {
  summary?: DeploymentSummary;
  loading?: boolean;
}

/** Top-of-page metric strip summarising the org's Editor deployment health. */
export function DeploymentSummaryStrip({ summary, loading }: Props) {
  if (loading || !summary) {
    return (
      <MetricStrip layout="row" leading={<EditorIcon size={22} />}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} width="5rem" height="2rem" />
        ))}
      </MetricStrip>
    );
  }

  return (
    <MetricStrip layout="row" leading={<EditorIcon size={22} />}>
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
