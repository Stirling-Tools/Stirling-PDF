import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, CodeBlock, Modal, StatTile } from "@shared/components";
import { type Source, SOURCE_TYPE_META } from "@portal/api/sources";
import "@portal/views/Sources.css";

const WIZARD_STEP_COUNT = 3;

const CONNECT_SNIPPET = `curl https://api.stirlingpdf.com/v1/extract \\
  -H "Authorization: Bearer sk_live_••••" \\
  -F "file=@invoice.pdf" \\
  -F "pipeline=invoice-v3"`;

interface ConnectWizardProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Guided shell for connecting a new source. The final step is a demo stub that
 * closes without provisioning — wiring it to the backend creates the source.
 */
export function ConnectWizard({ open, onClose }: ConnectWizardProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [type, setType] = useState<Source["type"]>("agent");

  const wizardSteps = [
    t("sources.wizard.steps.chooseType"),
    t("sources.wizard.steps.configure"),
    t("sources.wizard.steps.review"),
  ];

  function close() {
    onClose();
    // Reset for the next open, after the close transition has finished.
    setTimeout(() => {
      setStep(0);
      setType("agent");
    }, 200);
  }

  const isLast = step === WIZARD_STEP_COUNT - 1;

  function advance() {
    if (isLast) {
      // TODO(backend): POST /v1/sources { type, pipeline, region } — provision
      // the source, then close on success.
      close();
    } else {
      setStep((s) => s + 1);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      width="lg"
      title={t("sources.wizard.title")}
      subtitle={t("sources.wizard.subtitle", {
        current: step + 1,
        total: WIZARD_STEP_COUNT,
        label: wizardSteps[step],
      })}
      footer={
        <div className="portal-sources__wizard-footer">
          <Button
            variant="tertiary"
            size="sm"
            onClick={() => (step === 0 ? close() : setStep((s) => s - 1))}
          >
            {step === 0 ? t("sources.wizard.cancel") : t("sources.wizard.back")}
          </Button>
          <Button
            size="sm"
            onClick={advance}
            rightSection={!isLast ? <span aria-hidden>→</span> : undefined}
          >
            {isLast
              ? t("sources.actions.connectSource")
              : t("sources.wizard.continue")}
          </Button>
        </div>
      }
    >
      <ol className="portal-sources__steps" aria-hidden>
        {wizardSteps.map((label, i) => (
          <li
            key={label}
            className={
              "portal-sources__step" +
              (i === step ? " is-active" : i < step ? " is-done" : "")
            }
          >
            <span className="portal-sources__step-mark">
              {i < step ? "✓" : i + 1}
            </span>
            {label}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="portal-sources__type-grid">
          {(Object.keys(SOURCE_TYPE_META) as Source["type"][]).map((t) => {
            const meta = SOURCE_TYPE_META[t];
            return (
              <Button
                key={t}
                variant="tertiary"
                className={
                  "portal-sources__type-card" +
                  (type === t ? " is-selected" : "")
                }
                onClick={() => setType(t)}
              >
                <span className="portal-sources__type-icon" aria-hidden>
                  {meta.icon}
                </span>
                <span className="portal-sources__type-name">{meta.label}</span>
              </Button>
            );
          })}
        </div>
      )}

      {step === 1 && (
        <div className="portal-sources__wizard-body">
          <p className="portal-sources__wizard-lead">
            {t("sources.wizard.configureLead.before")}{" "}
            <strong>{SOURCE_TYPE_META[type].label}</strong>
            {t("sources.wizard.configureLead.after")}
          </p>
          <CodeBlock code={CONNECT_SNIPPET} caption="quickstart.sh" />
          <p className="portal-sources__wizard-note">
            {t("sources.wizard.configureNote")}
          </p>
        </div>
      )}

      {step === 2 && (
        <div className="portal-sources__wizard-body">
          <p className="portal-sources__wizard-lead">
            {t("sources.wizard.reviewLead.before")}{" "}
            <strong>{SOURCE_TYPE_META[type].label}</strong>
            {t("sources.wizard.reviewLead.after")}
          </p>
          <div className="portal-sources__stat-grid">
            <StatTile
              label={t("sources.wizard.type")}
              value={SOURCE_TYPE_META[type].label}
            />
            <StatTile
              label={t("sources.wizard.defaultPipeline")}
              value={t("sources.wizard.defaultPipelineValue")}
            />
            <StatTile
              label={t("sources.wizard.initialState")}
              value={t("sources.wizard.initialStateValue")}
            />
            <StatTile label={t("sources.wizard.region")} value="us-east-1" />
          </div>
        </div>
      )}
    </Modal>
  );
}
