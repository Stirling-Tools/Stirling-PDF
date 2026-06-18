import { MetricCard, MetricStrip } from "@shared/components";
import type { AgentsSummary } from "@portal/api/agents";

/**
 * KPI labels are product copy — they describe what each metric IS, not its
 * value — so the strip's structure stays stable across loading / ready states;
 * only values flow from the API.
 */
const KPI_LABELS = [
  "Active agents",
  "Avg eval pass rate",
  "Scenarios",
  "Latest published",
] as const;

interface AgentKpiStripProps {
  summary: AgentsSummary | null;
  loading: boolean;
}

export function AgentKpiStrip({ summary, loading }: AgentKpiStripProps) {
  const values: (string | number)[] = summary
    ? [
        summary.activeAgents,
        `${Math.round(summary.avgPassRate * 100)}%`,
        summary.totalScenarios,
        summary.latestPublished,
      ]
    : ["—", "—", "—", "—"];

  const descriptions: (string | undefined)[] = summary
    ? [
        `${summary.totalAgents} total`,
        "across golden sets",
        "test cases",
        "fleet-wide",
      ]
    : [];

  return (
    <MetricStrip>
      {KPI_LABELS.map((label, i) => (
        <MetricCard
          key={label}
          label={label}
          value={loading ? "—" : values[i]}
          description={loading ? undefined : descriptions[i]}
        />
      ))}
    </MetricStrip>
  );
}
