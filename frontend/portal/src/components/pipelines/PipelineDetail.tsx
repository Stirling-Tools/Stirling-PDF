import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const confDelta =
    (drift.confidenceDelta > 0 ? "+" : "") + drift.confidenceDelta.toFixed(2);
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
          {t("pipelines.detail.drift.confidence", { delta: confDelta })}
        </span>
        <span>
          {t("pipelines.detail.drift.docs", { count: drift.affectedDocs })}
        </span>
      </div>
    </li>
  );
}

export interface PipelineDetailProps {
  pipeline: Pipeline;
}

/** Drawer body: 24h metrics, the five stages, golden-set health, and schema drift. */
export function PipelineDetail({ pipeline }: PipelineDetailProps) {
  const { t } = useTranslation();
  const m = pipeline.metrics;
  const goldenRatio = pipeline.golden.total
    ? pipeline.golden.passing / pipeline.golden.total
    : 0;
  const goldenClean = pipeline.golden.passing === pipeline.golden.total;

  return (
    <div className="portal-pipelines__detail">
      <section className="portal-pipelines__detail-metrics">
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
        />
        <StatTile
          label={t("pipelines.metrics.p95Latency")}
          value={`${m.p95LatencyMs} ms`}
        />
        <StatTile
          label={t("pipelines.metrics.uptime")}
          value={pct(m.uptime, 2)}
        />
      </section>

      <section className="portal-pipelines__detail-section">
        <h3 className="portal-pipelines__detail-h">
          {t("pipelines.detail.stages.heading")}
        </h3>
        <p className="portal-pipelines__detail-sub">
          {t("pipelines.detail.stages.description", {
            source: pipeline.source,
            destination: pipeline.destination,
          })}
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
                      {t("pipelines.detail.stages.noOps")}
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
        <h3 className="portal-pipelines__detail-h">
          {t("pipelines.detail.golden.heading")}
        </h3>
        <div className="portal-pipelines__golden">
          <div className="portal-pipelines__golden-head">
            <StatusBadge tone={goldenClean ? "success" : "warning"} size="sm">
              {t("pipelines.detail.golden.passing", {
                passing: pipeline.golden.passing,
                total: pipeline.golden.total,
              })}
            </StatusBadge>
            <span className="portal-pipelines__golden-when">
              {t("pipelines.detail.golden.lastRun", {
                lastRun: pipeline.golden.lastRun,
              })}
            </span>
          </div>
          <ProgressBar
            value={goldenRatio}
            color={
              goldenClean
                ? "var(--color-green)"
                : "linear-gradient(90deg, var(--color-amber), color-mix(in srgb, var(--color-amber) 70%, white))"
            }
            label={t("pipelines.detail.golden.barLabel", {
              passing: pipeline.golden.passing,
              total: pipeline.golden.total,
            })}
          />
        </div>
      </section>

      <section className="portal-pipelines__detail-section">
        <h3 className="portal-pipelines__detail-h">
          {t("pipelines.detail.drift.heading")}
        </h3>
        {pipeline.drift.length === 0 ? (
          <EmptyState
            size="compact"
            title={t("pipelines.detail.drift.empty.title")}
            description={t("pipelines.detail.drift.empty.description")}
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
