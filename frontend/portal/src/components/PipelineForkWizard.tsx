import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Card, Chip, StatusBadge } from "@shared/components";
import { useView } from "@portal/contexts/ViewContext";
import {
  PIPELINE_STAGES,
  PIPELINE_TEMPLATES,
  type PipelineTemplate,
} from "@portal/api/home";
import "@portal/components/PipelineForkWizard.css";

/**
 * Wizard phases:
 *   - `pick`     — choose a starter template
 *   - `building` — deterministic stage-by-stage build animation
 *   - `ready`    — all four stages lit; offer deploy
 */
type Phase = "pick" | "building" | "ready";

/** Time each build stage stays "in progress" before the next lights up. */
const STAGE_STEP_MS = 550;

export function PipelineForkWizard() {
  const { t } = useTranslation();
  const { setActiveView } = useView();
  const [phase, setPhase] = useState<Phase>("pick");
  const [template, setTemplate] = useState<PipelineTemplate | null>(null);
  // How many stages have completed. Drives both the animation and the
  // pick→building→ready transitions; advanced purely by a fixed-interval timer
  // so the sequence is identical on every run (no Math.random / Date.now).
  const [builtStages, setBuiltStages] = useState(0);
  const timerRef = useRef<number | null>(null);

  // Advance one stage per tick while building; settle into `ready` once all
  // stages are done. The effect re-arms itself on each builtStages change
  // rather than holding a single long-lived interval, so cleanup is trivial.
  useEffect(() => {
    if (phase !== "building") return;
    if (builtStages >= PIPELINE_STAGES.length) {
      setPhase("ready");
      return;
    }
    timerRef.current = window.setTimeout(() => {
      setBuiltStages((n) => n + 1);
    }, STAGE_STEP_MS);
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [phase, builtStages]);

  function fork(t: PipelineTemplate) {
    setTemplate(t);
    setBuiltStages(0);
    setPhase("building");
  }

  function reset() {
    setPhase("pick");
    setTemplate(null);
    setBuiltStages(0);
  }

  function deploy() {
    // TODO(backend): POST /v1/pipelines { templateId, name } to create the
    // forked pipeline. Without a backend, route to the pipelines list.
    setActiveView("pipelines");
  }

  return (
    <Card padding="loose" className="portal-fork">
      <header className="portal-fork__head">
        <div>
          <h2 className="portal-fork__title">{t("forkWizard.title")}</h2>
          <p className="portal-fork__sub">{t("forkWizard.subtitle")}</p>
        </div>
        {phase !== "pick" && template && (
          <StatusBadge tone={phase === "ready" ? "success" : "info"} size="sm">
            {phase === "ready"
              ? t("forkWizard.status.ready")
              : t("forkWizard.status.building")}
          </StatusBadge>
        )}
      </header>

      {phase === "pick" && (
        <div className="portal-fork__templates">
          {PIPELINE_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              className="portal-fork__template"
              data-accent={t.accent}
              onClick={() => fork(t)}
            >
              <span className="portal-fork__template-name">{t.name}</span>
              <span className="portal-fork__template-blurb">{t.blurb}</span>
              <span className="portal-fork__template-types">
                {t.docTypes.map((d) => (
                  <Chip key={d} size="sm" tone="neutral">
                    {d}
                  </Chip>
                ))}
              </span>
            </button>
          ))}
        </div>
      )}

      {phase !== "pick" && template && (
        <div className="portal-fork__build">
          <div className="portal-fork__build-head">
            <strong>{template.name}</strong>
            <span>{template.blurb}</span>
          </div>

          <ol className="portal-fork__stages">
            {PIPELINE_STAGES.map((stage, i) => {
              const done = i < builtStages;
              const active = phase === "building" && i === builtStages;
              const cls =
                "portal-fork__stage" +
                (done ? " is-done" : "") +
                (active ? " is-active" : "");
              return (
                <li key={stage.key} className={cls}>
                  <span className="portal-fork__stage-mark" aria-hidden>
                    {done ? "✓" : i + 1}
                  </span>
                  <span className="portal-fork__stage-text">
                    <strong>{stage.label}</strong>
                    <span>{stage.detail}</span>
                  </span>
                  {active && (
                    <span className="portal-fork__stage-spin" aria-hidden />
                  )}
                </li>
              );
            })}
          </ol>

          <div className="portal-fork__build-actions">
            <Button variant="ghost" size="sm" onClick={reset}>
              {phase === "ready"
                ? t("forkWizard.action.pickAnother")
                : t("forkWizard.action.cancel")}
            </Button>
            <Button
              variant="gradient"
              size="sm"
              onClick={deploy}
              disabled={phase !== "ready"}
              trailingIcon={<span aria-hidden>→</span>}
            >
              {phase === "ready"
                ? t("forkWizard.action.deploy")
                : t("forkWizard.status.building")}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
