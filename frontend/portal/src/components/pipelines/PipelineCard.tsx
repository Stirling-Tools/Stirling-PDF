import { useTranslation } from "react-i18next";
import { Card, StatTile, StatusBadge } from "@shared/components";
import type { Pipeline, StageSummary } from "@portal/api/pipelines";
import {
  STAGE_ACCENT,
  STAGE_COLOR_VAR,
} from "@portal/components/pipelines/stageAccent";
import { compact, pct } from "@portal/components/pipelines/format";

/** Compact five-dot stage indicator: a lit dot per stage that has ops. */
function StageDots({ stages }: { stages: StageSummary[] }) {
  const { t } = useTranslation();
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
          title={t("pipelines.card.stageTooltip", {
            label: s.label,
            count: s.ops.length,
          })}
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
  const { t } = useTranslation();
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
          {degraded
            ? t("pipelines.status.degraded")
            : t("pipelines.status.healthy")}
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
        <StatTile
          label={t("pipelines.metrics.docs24h")}
          value={compact(m.docs24h)}
        />
        <StatTile
          label={t("pipelines.metrics.throughput")}
          value={`${m.throughputPerMin}/min`}
        />
        <StatTile
          label={t("pipelines.metrics.errorRate")}
          value={pct(m.errorRate, 2)}
          tone={errorTone}
        />
        <StatTile
          label={t("pipelines.metrics.p95Latency")}
          value={`${m.p95LatencyMs} ms`}
        />
        <StatTile
          label={t("pipelines.metrics.uptime")}
          value={pct(m.uptime, 2)}
        />
      </div>

      <div className="portal-pipelines__card-foot">
        <span className="portal-pipelines__card-version">
          {pipeline.version} · {pipeline.regions.join(", ")}
        </span>
        <span className="portal-pipelines__card-golden">
          {t("pipelines.card.golden", {
            passing: pipeline.golden.passing,
            total: pipeline.golden.total,
          })}
          {driftCount > 0 && (
            <span className="portal-pipelines__card-drift">
              {" · "}
              {t("pipelines.card.drift", { count: driftCount })}
            </span>
          )}
        </span>
      </div>
    </Card>
  );
}
