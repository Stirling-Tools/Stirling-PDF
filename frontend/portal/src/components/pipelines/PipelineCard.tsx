import { Card, StatTile, StatusBadge } from "@shared/components";
import type { Pipeline, StageSummary } from "@portal/api/pipelines";
import {
  STAGE_ACCENT,
  STAGE_COLOR_VAR,
} from "@portal/components/pipelines/stageAccent";
import { compact, pct } from "@portal/components/pipelines/format";

/** Compact five-dot stage indicator: a lit dot per stage that has ops. */
function StageDots({ stages }: { stages: StageSummary[] }) {
  return (
    <span className="portal-pipelines__stage-dots" aria-hidden>
      {stages.map((s) => (
        <span
          key={s.key}
          className="portal-pipelines__stage-dot"
          style={{
            background: s.ops.length
              ? STAGE_COLOR_VAR[STAGE_ACCENT[s.key]]
              : "var(--color-border)",
          }}
          title={`${s.label}: ${s.ops.length} op${s.ops.length === 1 ? "" : "s"}`}
        />
      ))}
    </span>
  );
}

export interface PipelineCardProps {
  pipeline: Pipeline;
  onOpen: (p: Pipeline) => void;
}

/** Row in the deployed fleet: health, source→stages→destination rail, 24h metrics. */
export function PipelineCard({ pipeline, onOpen }: PipelineCardProps) {
  const m = pipeline.metrics;
  const degraded = pipeline.status === "degraded";
  const errorTone =
    m.errorRate >= 0.02
      ? "danger"
      : m.errorRate >= 0.01
        ? "warning"
        : "default";
  const driftCount = pipeline.drift.length;

  return (
    <Card
      padding="loose"
      interactive
      className="portal-pipelines__card"
      onClick={() => onOpen(pipeline)}
    >
      <div className="portal-pipelines__card-head">
        <div className="portal-pipelines__card-titles">
          <h3 className="portal-pipelines__card-title">{pipeline.name}</h3>
          <p className="portal-pipelines__card-blurb">{pipeline.blurb}</p>
        </div>
        <StatusBadge
          tone={degraded ? "warning" : "success"}
          size="sm"
          pulse={degraded}
        >
          {degraded ? "Degraded" : "Healthy"}
        </StatusBadge>
      </div>

      <div className="portal-pipelines__card-rail">
        <span className="portal-pipelines__rail-chip">{pipeline.source}</span>
        <span className="portal-pipelines__rail-arrow" aria-hidden>
          →
        </span>
        <StageDots stages={pipeline.stages} />
        <span className="portal-pipelines__rail-arrow" aria-hidden>
          →
        </span>
        <span className="portal-pipelines__rail-chip">
          {pipeline.destination}
        </span>
      </div>

      <div className="portal-pipelines__metrics">
        <StatTile label="Docs / 24h" value={compact(m.docs24h)} />
        <StatTile label="Throughput" value={`${m.throughputPerMin}/min`} />
        <StatTile
          label="Error rate"
          value={pct(m.errorRate, 2)}
          tone={errorTone}
        />
        <StatTile label="P95 latency" value={`${m.p95LatencyMs} ms`} />
        <StatTile label="Uptime" value={pct(m.uptime, 2)} />
      </div>

      <div className="portal-pipelines__card-foot">
        <span className="portal-pipelines__card-version">
          {pipeline.version} · {pipeline.regions.join(", ")}
        </span>
        <span className="portal-pipelines__card-golden">
          Golden {pipeline.golden.passing}/{pipeline.golden.total}
          {driftCount > 0 && (
            <span className="portal-pipelines__card-drift">
              {" · "}
              {driftCount} drift{driftCount > 1 ? "s" : ""}
            </span>
          )}
        </span>
      </div>
    </Card>
  );
}
