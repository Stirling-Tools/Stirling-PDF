import { useTranslation } from "react-i18next";
import { Button, Chip } from "@shared/components";
import type { PipelineView } from "@portal/api/pipelines";
import { humanizeOperation } from "@portal/components/pipelines/pipelineOperations";
import "@portal/views/Pipelines.css";

interface PipelineDetailCardProps {
  pipeline: PipelineView;
  onClose: () => void;
  onEdit: (pipeline: PipelineView) => void;
  onTogglePause: (pipeline: PipelineView) => void;
  onDelete: (pipeline: PipelineView) => void;
  /** Disables the actions while a mutation is in flight. */
  busy?: boolean;
}

/** Expanded detail for the selected pipeline row, with edit/pause/delete actions. */
export function PipelineDetailCard({
  pipeline,
  onClose,
  onEdit,
  onTogglePause,
  onDelete,
  busy = false,
}: PipelineDetailCardProps) {
  const { t } = useTranslation();
  const paused = pipeline.status === "paused";
  return (
    <section className="portal-pipelines__expanded">
      <header className="portal-pipelines__expanded-head">
        <span className="portal-pipelines__pipe-dot" aria-hidden>
          ⛓
        </span>
        <div>
          <h2 className="portal-pipelines__expanded-title">{pipeline.name}</h2>
          <span className="portal-pipelines__expanded-sub">
            {t("pipelines.detail.subtitle", {
              trigger: t(`pipelines.trigger.${pipeline.trigger}`, {
                defaultValue: pipeline.trigger,
              }),
              status: t(`pipelines.status.${pipeline.status}`),
            })}
          </span>
        </div>
        <button
          type="button"
          className="portal-pipelines__expanded-close"
          onClick={onClose}
          aria-label={t("pipelines.detail.closeAriaLabel")}
        >
          ×
        </button>
      </header>

      <div className="portal-pipelines__detail">
        <div className="portal-pipelines__detail-section">
          <span className="portal-pipelines__detail-heading">
            {t("pipelines.detail.steps")}
          </span>
          {pipeline.steps.length === 0 ? (
            <p className="portal-pipelines__muted">
              {t("pipelines.detail.noSteps")}
            </p>
          ) : (
            <div className="portal-pipelines__chips">
              {pipeline.steps.map((step, i) => (
                <Chip key={`${step}-${i}`} tone="blue" size="sm">
                  {`${i + 1}. ${humanizeOperation(step)}`}
                </Chip>
              ))}
            </div>
          )}
        </div>

        <div className="portal-pipelines__detail-section">
          <span className="portal-pipelines__detail-heading">
            {t("pipelines.detail.sources")}
          </span>
          {pipeline.sources.length === 0 ? (
            <p className="portal-pipelines__muted">
              {t("pipelines.detail.noSources")}
            </p>
          ) : (
            <div className="portal-pipelines__chips">
              {pipeline.sources.map((source) => (
                <Chip key={source.id} tone="neutral" size="sm">
                  {source.name}
                </Chip>
              ))}
            </div>
          )}
        </div>

        <div className="portal-pipelines__detail-section">
          <span className="portal-pipelines__detail-heading">
            {t("pipelines.detail.output")}
          </span>
          <Chip tone="purple" size="sm">
            {t(`pipelines.output.${pipeline.output}`, {
              defaultValue: pipeline.output,
            })}
          </Chip>
        </div>
      </div>

      <div className="portal-pipelines__detail-actions">
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => onEdit(pipeline)}
        >
          {t("pipelines.detail.edit")}
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => onTogglePause(pipeline)}
        >
          {paused ? t("pipelines.detail.resume") : t("pipelines.detail.pause")}
        </Button>
        <Button
          accent="red"
          variant="outline"
          disabled={busy}
          onClick={() => onDelete(pipeline)}
        >
          {t("pipelines.detail.delete")}
        </Button>
      </div>
    </section>
  );
}
