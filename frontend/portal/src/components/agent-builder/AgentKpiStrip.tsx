import { useTranslation } from "react-i18next";
import { MetricCard, MetricStrip } from "@shared/components";
import type { AgentsSummary } from "@portal/api/agents";

interface AgentKpiStripProps {
  summary: AgentsSummary | null;
  loading: boolean;
}

export function AgentKpiStrip({ summary, loading }: AgentKpiStripProps) {
  const { t } = useTranslation();

  /**
   * KPI labels are product copy — they describe what each metric IS, not its
   * value — so the strip's structure stays stable across loading / ready
   * states; only values flow from the API.
   */
  const kpiLabels = [
    t("agentBuilder.kpi.activeAgents"),
    t("agentBuilder.kpi.avgPassRate"),
    t("agentBuilder.kpi.scenarios"),
    t("agentBuilder.kpi.latestPublished"),
  ] as const;

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
        t("agentBuilder.kpi.totalDescription", { count: summary.totalAgents }),
        t("agentBuilder.kpi.acrossGoldenSets"),
        t("agentBuilder.kpi.testCases"),
        t("agentBuilder.kpi.fleetWide"),
      ]
    : [];

  return (
    <MetricStrip>
      {kpiLabels.map((label, i) => (
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
