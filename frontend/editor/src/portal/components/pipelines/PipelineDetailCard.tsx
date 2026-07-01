import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button, Chip } from "@shared/components";
import { errorMessage } from "@portal/api/http";
import {
  fetchRun,
  triggerPipeline,
  type PipelineView,
  type PolicyRunView,
} from "@portal/api/pipelines";
import { humanizeOperation } from "@portal/components/pipelines/pipelineOperations";
import "@portal/views/Pipelines.css";

const TERMINAL_STATUSES = new Set(["COMPLETED", "FAILED", "CANCELLED"]);
const POLL_INTERVAL_MS = 1500;
const POLL_ATTEMPTS = 60;

type RunResult = { tone: "success" | "danger" | "info"; text: string };

interface PipelineDetailCardProps {
  pipeline: PipelineView;
  onClose: () => void;
  onEdit: (pipeline: PipelineView) => void;
  onTogglePause: (pipeline: PipelineView) => void;
  onDelete: (pipeline: PipelineView) => void;
  /** Disables the actions while a page-level mutation is in flight. */
  busy?: boolean;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Expanded detail for the selected pipeline row, with run/edit/pause/delete actions. */
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

  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Poll a run until it reaches a terminal state (or we give up), so a failure
  // during execution surfaces with its error message rather than silently.
  async function awaitRun(runId: string): Promise<PolicyRunView | null> {
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
      if (!mounted.current) return null;
      const view = await fetchRun(runId);
      if (TERMINAL_STATUSES.has(view.status)) return view;
      await sleep(POLL_INTERVAL_MS);
    }
    return null;
  }

  async function handleRun() {
    if (running || busy) return;
    setRunning(true);
    setRunResult(null);
    try {
      const runIds = await triggerPipeline(pipeline.id);
      if (runIds.length === 0) {
        if (mounted.current)
          setRunResult({ tone: "info", text: t("pipelines.run.empty") });
        return;
      }
      const finals = await Promise.all(runIds.map((id) => awaitRun(id)));
      if (!mounted.current) return;
      const failed = finals.find((r) => r?.status === "FAILED");
      if (failed) {
        setRunResult({
          tone: "danger",
          text: t("pipelines.run.failed", { error: failed.error ?? "" }),
        });
      } else if (finals.every((r) => r?.status === "COMPLETED")) {
        setRunResult({
          tone: "success",
          text: t("pipelines.run.completed", { count: finals.length }),
        });
      } else {
        // Still running when we stopped polling, or cancelled.
        setRunResult({ tone: "info", text: t("pipelines.run.running") });
      }
    } catch (e) {
      if (mounted.current)
        setRunResult({ tone: "danger", text: errorMessage(e) });
    } finally {
      if (mounted.current) setRunning(false);
    }
  }

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

      {runResult && (
        <Banner tone={runResult.tone} description={runResult.text} />
      )}

      <div className="portal-pipelines__detail-actions">
        <Button loading={running} disabled={busy} onClick={handleRun}>
          {t("pipelines.detail.run")}
        </Button>
        <Button
          variant="outline"
          disabled={busy || running}
          onClick={() => onEdit(pipeline)}
        >
          {t("pipelines.detail.edit")}
        </Button>
        <Button
          variant="outline"
          disabled={busy || running}
          onClick={() => onTogglePause(pipeline)}
        >
          {paused ? t("pipelines.detail.resume") : t("pipelines.detail.pause")}
        </Button>
        <Button
          accent="red"
          variant="outline"
          disabled={busy || running}
          onClick={() => onDelete(pipeline)}
        >
          {t("pipelines.detail.delete")}
        </Button>
      </div>
    </section>
  );
}
