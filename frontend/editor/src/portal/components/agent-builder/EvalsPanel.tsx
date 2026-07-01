import { useTranslation } from "react-i18next";
import {
  Button,
  EmptyState,
  ProgressBar,
  StatTile,
  StatusBadge,
  Table,
  type TableColumn,
} from "@shared/components";
import type { Agent, EvalCase } from "@portal/api/agents";
import "@portal/views/AgentBuilder.css";

interface EvalsPanelProps {
  agent: Agent;
}

/** Golden-set pass-rate, the per-case results table, and a run affordance. */
export function EvalsPanel({ agent }: EvalsPanelProps) {
  const { t } = useTranslation();

  const columns: TableColumn<EvalCase>[] = [
    {
      key: "name",
      header: t("agentBuilder.evals.columnCase"),
      render: (c) => c.name,
    },
    {
      key: "result",
      header: t("agentBuilder.evals.columnResult"),
      render: (c) =>
        c.passing === null ? (
          <span className="portal-agents__muted">
            {t("agentBuilder.evals.notRun")}
          </span>
        ) : (
          <StatusBadge tone={c.passing ? "success" : "danger"} size="sm">
            {c.passing
              ? t("agentBuilder.evals.pass")
              : t("agentBuilder.evals.fail")}
          </StatusBadge>
        ),
    },
    {
      key: "latency",
      header: t("agentBuilder.evals.columnLatency"),
      align: "right",
      render: (c) => (
        <span className="portal-agents__mono">
          {t("agentBuilder.evals.latencyMs", { ms: c.latencyMs })}
        </span>
      ),
    },
  ];

  if (agent.evalsTotal === 0) {
    return (
      <div className="portal-agents__panel">
        <EmptyState
          title={t("agentBuilder.evals.empty.title")}
          description={t("agentBuilder.evals.empty.description")}
          size="compact"
        />
      </div>
    );
  }

  const rate = agent.evalsPassing / agent.evalsTotal;

  function runEvals() {
    // TODO(backend): POST /v1/agents/{id}/evals/run — kick off a golden-set
    // run, then poll for the updated case results.
  }

  return (
    <div className="portal-agents__panel">
      <div className="portal-agents__eval-head">
        <div className="portal-agents__stat-grid portal-agents__stat-grid--two">
          <StatTile
            label={t("agentBuilder.evals.passRate")}
            value={`${Math.round(rate * 100)}%`}
            tone={rate >= 0.95 ? "success" : rate >= 0.8 ? "warning" : "danger"}
          />
          <StatTile
            label={t("agentBuilder.evals.casesPassing")}
            value={`${agent.evalsPassing} / ${agent.evalsTotal}`}
          />
        </div>
        <Button size="sm" variant="outline" onClick={runEvals}>
          {t("agentBuilder.evals.runEvals")}
        </Button>
      </div>

      <div className="portal-agents__bar-row">
        <div className="portal-agents__bar-head">
          <span>{t("agentBuilder.evals.goldenSetPassRate")}</span>
          <strong>{Math.round(rate * 100)}%</strong>
        </div>
        <ProgressBar
          value={rate}
          color={rate >= 0.95 ? "var(--color-green)" : "var(--color-amber)"}
          label={t("agentBuilder.evals.goldenSetPassRate")}
        />
      </div>

      <Table<EvalCase>
        columns={columns}
        rows={agent.evalCases}
        rowKey={(c) => c.id}
      />
    </div>
  );
}
