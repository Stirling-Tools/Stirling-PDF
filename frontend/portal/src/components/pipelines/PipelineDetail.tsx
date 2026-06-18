import {
  Chip,
  EmptyState,
  ProgressBar,
  StatTile,
  StatusBadge,
} from "@shared/components";
import type { Pipeline, SchemaDrift } from "@portal/api/pipelines";
import {
  STAGE_ACCENT,
  STAGE_COLOR_VAR,
} from "@portal/components/pipelines/stageAccent";
import { compact, pct } from "@portal/components/pipelines/format";

function DriftRow({ drift }: { drift: SchemaDrift }) {
  return (
    <li className="portal-pipelines__drift">
      <span
        className="portal-pipelines__drift-dot"
        style={{
          background:
            drift.severity === "warning"
              ? "var(--color-amber)"
              : "var(--color-blue)",
        }}
        aria-hidden
      />
      <div className="portal-pipelines__drift-text">
        <code className="portal-pipelines__drift-field">{drift.field}</code>
        <span className="portal-pipelines__drift-note">{drift.note}</span>
      </div>
      <div className="portal-pipelines__drift-meta">
        <span>
          {drift.confidenceDelta > 0 ? "+" : ""}
          {drift.confidenceDelta.toFixed(2)} conf
        </span>
        <span>{drift.affectedDocs} docs</span>
      </div>
    </li>
  );
}

export interface PipelineDetailProps {
  pipeline: Pipeline;
}

/** Drawer body: 24h metrics, the five stages, golden-set health, and schema drift. */
export function PipelineDetail({ pipeline }: PipelineDetailProps) {
  const m = pipeline.metrics;
  const goldenRatio = pipeline.golden.total
    ? pipeline.golden.passing / pipeline.golden.total
    : 0;
  const goldenClean = pipeline.golden.passing === pipeline.golden.total;

  return (
    <div className="portal-pipelines__detail">
      <section className="portal-pipelines__detail-metrics">
        <StatTile label="Docs / 24h" value={compact(m.docs24h)} />
        <StatTile label="Throughput" value={`${m.throughputPerMin}/min`} />
        <StatTile label="Error rate" value={pct(m.errorRate, 2)} />
        <StatTile label="P95 latency" value={`${m.p95LatencyMs} ms`} />
        <StatTile label="Uptime" value={pct(m.uptime, 2)} />
      </section>

      <section className="portal-pipelines__detail-section">
        <h3 className="portal-pipelines__detail-h">Pipeline stages</h3>
        <p className="portal-pipelines__detail-sub">
          Every document flows through five stages between {pipeline.source} and{" "}
          {pipeline.destination}.
        </p>
        <div className="portal-pipelines__stages">
          {pipeline.stages.map((stage) => {
            const accent = STAGE_ACCENT[stage.key];
            return (
              <div key={stage.key} className="portal-pipelines__stage">
                <div className="portal-pipelines__stage-head">
                  <span
                    className="portal-pipelines__stage-pip"
                    style={{ background: STAGE_COLOR_VAR[accent] }}
                    aria-hidden
                  />
                  <span className="portal-pipelines__stage-name">
                    {stage.label}
                  </span>
                </div>
                <div className="portal-pipelines__stage-chips">
                  {stage.ops.length === 0 ? (
                    <span className="portal-pipelines__stage-empty">
                      No ops
                    </span>
                  ) : (
                    stage.ops.map((op) => (
                      <Chip key={op} tone={accent} size="sm">
                        {op}
                      </Chip>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="portal-pipelines__detail-section">
        <h3 className="portal-pipelines__detail-h">Golden-set validation</h3>
        <div className="portal-pipelines__golden">
          <div className="portal-pipelines__golden-head">
            <StatusBadge tone={goldenClean ? "success" : "warning"} size="sm">
              {pipeline.golden.passing} of {pipeline.golden.total} passing
            </StatusBadge>
            <span className="portal-pipelines__golden-when">
              last run {pipeline.golden.lastRun}
            </span>
          </div>
          <ProgressBar
            value={goldenRatio}
            color={
              goldenClean
                ? "var(--color-green)"
                : "linear-gradient(90deg, var(--color-amber), color-mix(in srgb, var(--color-amber) 70%, white))"
            }
            label={`Golden set ${pipeline.golden.passing} of ${pipeline.golden.total} passing`}
          />
        </div>
      </section>

      <section className="portal-pipelines__detail-section">
        <h3 className="portal-pipelines__detail-h">Schema drift</h3>
        {pipeline.drift.length === 0 ? (
          <EmptyState
            size="compact"
            title="No drift detected"
            description="Every document in the last 24h matched its inferred schema."
          />
        ) : (
          <ul className="portal-pipelines__drift-list">
            {pipeline.drift.map((d) => (
              <DriftRow key={d.field} drift={d} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
