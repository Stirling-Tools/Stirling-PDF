import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Chip, Modal } from "@shared/components";
import {
  DESTINATION_OPTIONS,
  PIPELINE_OPS,
  PIPELINE_AGENTS,
  SOURCE_OPTIONS,
  type OpKind,
  type PipelineOp,
} from "@shared/data/ops";
import {
  OP_KIND_ACCENT,
  STAGE_COLOR_VAR,
} from "@portal/components/pipelines/stageAccent";

const COMPOSER_STEPS = ["source", "operations", "routing"] as const;

/** Translation key suffixes for each op-kind group heading in the picker. */
const OP_KIND_LABEL_KEY: Record<OpKind, string> = {
  ingest: "ingest",
  validate: "validate",
  modify: "modify",
  secure: "secure",
  store: "store",
  alert: "alert",
};

/** Selectable ops in the picker — excludes pipeline-only structural ops. */
const PICKER_OPS: Record<OpKind, PipelineOp[]> = (() => {
  const out = {} as Record<OpKind, PipelineOp[]>;
  for (const kind of Object.keys(PIPELINE_OPS) as OpKind[]) {
    out[kind] = PIPELINE_OPS[kind].filter((op) => !op.pipelineOnly);
  }
  return out;
})();

function lookupPickerOp(id: string): PipelineOp | null {
  for (const kind of Object.keys(PICKER_OPS) as OpKind[]) {
    const found = PICKER_OPS[kind].find((op) => op.id === id);
    if (found) return found;
  }
  return null;
}

export interface PipelineComposerProps {
  open: boolean;
  onClose: () => void;
}

/** Three-step wizard: pick a source, compose the op chain, route the output. */
export function PipelineComposer({ open, onClose }: PipelineComposerProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [source, setSource] = useState<string>("upload");
  const [selectedOps, setSelectedOps] = useState<string[]>([
    "extract",
    "validate",
    "redact",
  ]);
  const [destination, setDestination] = useState<string>("vault");
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifyWebhook, setNotifyWebhook] = useState(false);
  const [reviewQueue, setReviewQueue] = useState(true);

  function reset() {
    setStep(0);
    setSource("upload");
    setSelectedOps(["extract", "validate", "redact"]);
    setDestination("vault");
    setNotifyEmail(true);
    setNotifyWebhook(false);
    setReviewQueue(true);
  }

  function close() {
    onClose();
    // Defer reset so it doesn't flash mid-close-animation.
    setTimeout(reset, 0);
  }

  function deploy() {
    // TODO(backend): POST /v1/pipelines { source, ops: selectedOps, destination, alerts }
    close();
  }

  function toggleOp(id: string) {
    setSelectedOps((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function applyAgent(ops: string[]) {
    // A bundle lists its full op set, but structural rails (retention,
    // residency, access policy) aren't user-chainable picker ops — add only
    // ops that exist in the picker so every chain chip resolves to a label.
    const pickable = ops.filter((id) => lookupPickerOp(id) !== null);
    setSelectedOps((prev) => Array.from(new Set([...prev, ...pickable])));
  }

  const isLast = step === COMPOSER_STEPS.length - 1;
  const canAdvance = step === 1 ? selectedOps.length > 0 : true;

  return (
    <Modal
      open={open}
      onClose={close}
      width="xl"
      title={t("pipelines.composer.title")}
      subtitle={t("pipelines.composer.subtitle")}
      footer={
        <>
          <div className="portal-pipelines__composer-steps" aria-hidden>
            {COMPOSER_STEPS.map((stepId, i) => (
              <span
                key={stepId}
                className={
                  "portal-pipelines__composer-step" +
                  (i === step ? " is-active" : i < step ? " is-done" : "")
                }
              >
                {i + 1}. {t(`pipelines.composer.steps.${stepId}`)}
              </span>
            ))}
          </div>
          <Button variant="ghost" onClick={close}>
            {t("pipelines.composer.cancel")}
          </Button>
          {step > 0 && (
            <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
              {t("pipelines.composer.back")}
            </Button>
          )}
          {isLast ? (
            <Button
              variant="gradient"
              onClick={deploy}
              trailingIcon={<span aria-hidden>→</span>}
            >
              {t("pipelines.composer.deploy")}
            </Button>
          ) : (
            <Button
              variant="gradient"
              onClick={() => setStep((s) => s + 1)}
              disabled={!canAdvance}
              trailingIcon={<span aria-hidden>→</span>}
            >
              {t("pipelines.composer.continue")}
            </Button>
          )}
        </>
      }
    >
      <div className="portal-pipelines__composer">
        {step === 0 && (
          <div className="portal-pipelines__composer-body">
            <div className="portal-pipelines__composer-grid">
              <button
                type="button"
                className={
                  "portal-pipelines__option" +
                  (source === "any" ? " is-selected" : "")
                }
                onClick={() => setSource("any")}
              >
                <span className="portal-pipelines__option-label">
                  {t("pipelines.composer.anySource.label")}
                </span>
                <span className="portal-pipelines__option-desc">
                  {t("pipelines.composer.anySource.desc")}
                </span>
              </button>
              {SOURCE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={
                    "portal-pipelines__option" +
                    (source === opt.id ? " is-selected" : "")
                  }
                  onClick={() => setSource(opt.id)}
                >
                  <span className="portal-pipelines__option-label">
                    {opt.label}
                  </span>
                  <span className="portal-pipelines__option-desc">
                    {opt.desc}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="portal-pipelines__composer-body">
            <div className="portal-pipelines__chain">
              <span className="portal-pipelines__chain-label">
                {t("pipelines.composer.operationChain", {
                  count: selectedOps.length,
                })}
              </span>
              <div className="portal-pipelines__chain-chips">
                {selectedOps.length === 0 ? (
                  <span className="portal-pipelines__chain-empty">
                    {t("pipelines.composer.chainEmpty")}
                  </span>
                ) : (
                  selectedOps.map((id) => {
                    const op = lookupPickerOp(id);
                    const accent = op ? OP_KIND_ACCENT[op.kind] : "purple";
                    return (
                      <Chip
                        key={id}
                        tone={accent}
                        size="sm"
                        onRemove={() => toggleOp(id)}
                      >
                        {op?.label ?? id}
                      </Chip>
                    );
                  })
                )}
              </div>
            </div>

            <div className="portal-pipelines__agents">
              <span className="portal-pipelines__agents-label">
                {t("pipelines.composer.quickAddBundles")}
              </span>
              <div className="portal-pipelines__agents-row">
                {PIPELINE_AGENTS.map((agent) => (
                  <Chip
                    key={agent.id}
                    tone="neutral"
                    size="sm"
                    onClick={() => applyAgent(agent.ops)}
                  >
                    + {agent.label}
                  </Chip>
                ))}
              </div>
            </div>

            <div className="portal-pipelines__library">
              {(Object.keys(PICKER_OPS) as OpKind[]).map((kind) => (
                <div key={kind} className="portal-pipelines__library-group">
                  <div className="portal-pipelines__library-head">
                    <span
                      className="portal-pipelines__library-pip"
                      style={{
                        background: STAGE_COLOR_VAR[OP_KIND_ACCENT[kind]],
                      }}
                      aria-hidden
                    />
                    {t(`pipelines.composer.opKind.${OP_KIND_LABEL_KEY[kind]}`)}
                  </div>
                  <div className="portal-pipelines__library-chips">
                    {PICKER_OPS[kind].map((op) => {
                      const on = selectedOps.includes(op.id);
                      return (
                        <Chip
                          key={op.id}
                          tone={on ? OP_KIND_ACCENT[kind] : "neutral"}
                          size="sm"
                          onClick={() => toggleOp(op.id)}
                        >
                          {on ? "✓ " : ""}
                          {op.label}
                        </Chip>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="portal-pipelines__composer-body">
            <span className="portal-pipelines__chain-label">
              {t("pipelines.composer.destination")}
            </span>
            <div className="portal-pipelines__composer-grid">
              {DESTINATION_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={
                    "portal-pipelines__option" +
                    (destination === opt.id ? " is-selected" : "")
                  }
                  onClick={() => setDestination(opt.id)}
                >
                  <span className="portal-pipelines__option-label">
                    {opt.label}
                  </span>
                  <span className="portal-pipelines__option-desc">
                    {opt.desc}
                  </span>
                </button>
              ))}
            </div>

            <span className="portal-pipelines__chain-label">
              {t("pipelines.composer.alerts")}
            </span>
            <div className="portal-pipelines__alerts">
              <label className="portal-pipelines__alert">
                <input
                  type="checkbox"
                  checked={notifyEmail}
                  onChange={(e) => setNotifyEmail(e.target.checked)}
                />
                <span>
                  <strong>{t("pipelines.composer.alert.email.title")}</strong>
                  <span>{t("pipelines.composer.alert.email.desc")}</span>
                </span>
              </label>
              <label className="portal-pipelines__alert">
                <input
                  type="checkbox"
                  checked={notifyWebhook}
                  onChange={(e) => setNotifyWebhook(e.target.checked)}
                />
                <span>
                  <strong>{t("pipelines.composer.alert.webhook.title")}</strong>
                  <span>{t("pipelines.composer.alert.webhook.desc")}</span>
                </span>
              </label>
              <label className="portal-pipelines__alert">
                <input
                  type="checkbox"
                  checked={reviewQueue}
                  onChange={(e) => setReviewQueue(e.target.checked)}
                />
                <span>
                  <strong>{t("pipelines.composer.alert.review.title")}</strong>
                  <span>{t("pipelines.composer.alert.review.desc")}</span>
                </span>
              </label>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
