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

const COLUMNS: TableColumn<EvalCase>[] = [
  { key: "name", header: "Eval case", render: (c) => c.name },
  {
    key: "result",
    header: "Result",
    render: (c) =>
      c.passing === null ? (
        <span className="portal-agents__muted">not run</span>
      ) : (
        <StatusBadge tone={c.passing ? "success" : "danger"} size="sm">
          {c.passing ? "pass" : "fail"}
        </StatusBadge>
      ),
  },
  {
    key: "latency",
    header: "Latency",
    align: "right",
    render: (c) => (
      <span className="portal-agents__mono">{c.latencyMs} ms</span>
    ),
  },
];

/** Golden-set pass-rate, the per-case results table, and a run affordance. */
export function EvalsPanel({ agent }: EvalsPanelProps) {
  if (agent.evalsTotal === 0) {
    return (
      <div className="portal-agents__panel">
        <EmptyState
          title="No golden set yet"
          description="Evals turn your scenarios into a repeatable golden set. Upgrade to capture pass-rate over time and gate publishes on it."
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
            label="Pass rate"
            value={`${Math.round(rate * 100)}%`}
            tone={rate >= 0.95 ? "success" : rate >= 0.8 ? "warning" : "danger"}
          />
          <StatTile
            label="Cases passing"
            value={`${agent.evalsPassing} / ${agent.evalsTotal}`}
          />
        </div>
        <Button size="sm" variant="outline" onClick={runEvals}>
          Run evals
        </Button>
      </div>

      <div className="portal-agents__bar-row">
        <div className="portal-agents__bar-head">
          <span>Golden-set pass rate</span>
          <strong>{Math.round(rate * 100)}%</strong>
        </div>
        <ProgressBar
          value={rate}
          color={rate >= 0.95 ? "var(--color-green)" : "var(--color-amber)"}
          label="Golden-set pass rate"
        />
      </div>

      <Table<EvalCase>
        columns={COLUMNS}
        rows={agent.evalCases}
        rowKey={(c) => c.id}
      />
    </div>
  );
}
