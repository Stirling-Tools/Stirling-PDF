import {
  Button,
  Chip,
  ProgressBar,
  StatTile,
  StatusBadge,
} from "@shared/components";
import type { AgentDetail } from "@portal/api/sources";
import { pct } from "@portal/components/sources/format";
import "@portal/views/Sources.css";

export function AgentPanel({ d }: { d: AgentDetail }) {
  const errorTone =
    d.errorRate >= 0.05
      ? "danger"
      : d.errorRate >= 0.02
        ? "warning"
        : "success";
  return (
    <div className="portal-sources__detail">
      <div className="portal-sources__stat-grid">
        <StatTile label="Model" value={<code>{d.model}</code>} />
        <StatTile label="Calls / 24h" value={d.calls24h.toLocaleString()} />
        <StatTile
          label="Error rate"
          value={
            <StatusBadge tone={errorTone} size="sm">
              {pct(d.errorRate)}
            </StatusBadge>
          }
        />
        <StatTile label="Escalations / 24h" value={d.escalations24h} />
      </div>

      <div className="portal-sources__bar-row">
        <div className="portal-sources__bar-head">
          <span>Mean confidence</span>
          <strong>{pct(d.confidence)}</strong>
        </div>
        <ProgressBar
          value={d.confidence}
          color={
            d.confidence >= 0.93 ? "var(--color-green)" : "var(--color-amber)"
          }
          label="Mean output confidence"
        />
      </div>

      <div className="portal-sources__detail-section">
        <span className="portal-sources__detail-heading">
          Assigned pipelines
        </span>
        <div className="portal-sources__chips">
          {d.assignedPipelines.map((p) => (
            <Chip key={p} accent="blue" size="sm">
              {p}
            </Chip>
          ))}
        </div>
      </div>

      <div className="portal-sources__detail-section">
        <span className="portal-sources__detail-heading">Scopes</span>
        <div className="portal-sources__chips">
          {d.scopes.map((s) => (
            <Chip key={s} accent="neutral" size="sm">
              {s}
            </Chip>
          ))}
        </div>
      </div>

      {/* TODO(backend): wire to GET /v1/sources/{id}/eval-runs and
          POST /v1/sources/{id}/pause — currently inert demo controls. */}
      <div className="portal-sources__detail-actions">
        <Button size="sm" variant="outlined">
          View eval runs
        </Button>
        <Button size="sm" variant="ghost">
          Pause agent
        </Button>
      </div>
    </div>
  );
}
