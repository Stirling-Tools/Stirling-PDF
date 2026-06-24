import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Banner,
  Button,
  FormField,
  Input,
  Modal,
  Select,
  StatTile,
} from "@shared/components";
import { HttpError } from "@portal/api/http";
import { createSource } from "@portal/api/sources";
import {
  CREATABLE_SOURCE_TYPES,
  defaultOptions,
  sourceTypeMeta,
  type CreatableSourceType,
} from "@portal/components/sources/sourceTypes";
import "@portal/views/Sources.css";

const WIZARD_STEP_COUNT = 3;
const DEFAULT_TYPE = CREATABLE_SOURCE_TYPES[0];

interface ConnectWizardProps {
  open: boolean;
  onClose: () => void;
  /** Called after a source is created so the page can refetch. */
  onCreated: () => void;
}

/** Best-effort human message from a thrown error (ProblemDetail or classic shape). */
function messageFor(error: unknown): string {
  if (error instanceof HttpError) {
    const body = error.body as {
      detail?: string;
      message?: string;
      error?: string;
    } | null;
    return body?.detail ?? body?.message ?? body?.error ?? error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

/** Guided flow for connecting a new source: choose type -> configure -> create. */
export function ConnectWizard({
  open,
  onClose,
  onCreated,
}: ConnectWizardProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [type, setType] = useState<CreatableSourceType>(DEFAULT_TYPE);
  const [name, setName] = useState("");
  const [options, setOptions] = useState<Record<string, string>>(() =>
    defaultOptions(DEFAULT_TYPE),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    onClose();
    // Reset for the next open, after the close transition has finished.
    setTimeout(() => {
      setStep(0);
      setType(DEFAULT_TYPE);
      setName("");
      setOptions(defaultOptions(DEFAULT_TYPE));
      setSubmitting(false);
      setError(null);
    }, 200);
  }

  function chooseType(next: CreatableSourceType) {
    setType(next);
    setOptions(defaultOptions(next));
  }

  const requiredFilled = type.fields.every(
    (f) => !f.required || (options[f.key] ?? "").trim() !== "",
  );
  const canContinue =
    step === 0
      ? !type.comingSoon
      : step === 1
        ? name.trim() !== "" && requiredFilled
        : true;
  const isLast = step === WIZARD_STEP_COUNT - 1;

  async function advance() {
    if (!isLast) {
      setStep((s) => s + 1);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createSource({
        name: name.trim(),
        type: type.type,
        options,
        enabled: true,
      });
      onCreated();
      close();
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setSubmitting(false);
    }
  }

  const wizardSteps = [
    t("sources.wizard.steps.chooseType"),
    t("sources.wizard.steps.configure"),
    t("sources.wizard.steps.review"),
  ];

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
            variant="ghost"
            size="sm"
            disabled={submitting}
            onClick={() => (step === 0 ? close() : setStep((s) => s - 1))}
          >
            {step === 0 ? t("sources.wizard.cancel") : t("sources.wizard.back")}
          </Button>
          <Button
            size="sm"
            onClick={advance}
            loading={submitting}
            disabled={!canContinue}
            trailingIcon={!isLast ? <span aria-hidden>→</span> : undefined}
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
          {CREATABLE_SOURCE_TYPES.map((ct) => (
            <button
              key={ct.type}
              type="button"
              disabled={ct.comingSoon}
              className={
                "portal-sources__type-card" +
                (type.type === ct.type ? " is-selected" : "")
              }
              onClick={() => chooseType(ct)}
            >
              <span className="portal-sources__type-icon" aria-hidden>
                {sourceTypeMeta(ct.type).icon}
              </span>
              <span className="portal-sources__type-name">{ct.label}</span>
              {ct.comingSoon && (
                <span className="portal-sources__type-soon">
                  {t("sources.wizard.comingSoon")}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {step === 1 && (
        <div className="portal-sources__wizard-body">
          <FormField label={t("sources.wizard.name")} required>
            <Input
              value={name}
              placeholder={t("sources.wizard.namePlaceholder")}
              onChange={(e) => setName(e.target.value)}
            />
          </FormField>
          {type.fields.map((field) => (
            <FormField
              key={field.key}
              label={field.label}
              helperText={field.helperText}
              required={field.required}
            >
              {field.control === "select" ? (
                <Select
                  value={options[field.key] ?? ""}
                  options={field.options ?? []}
                  onChange={(e) =>
                    setOptions((o) => ({ ...o, [field.key]: e.target.value }))
                  }
                />
              ) : (
                <Input
                  value={options[field.key] ?? ""}
                  placeholder={field.placeholder}
                  onChange={(e) =>
                    setOptions((o) => ({ ...o, [field.key]: e.target.value }))
                  }
                />
              )}
            </FormField>
          ))}
        </div>
      )}

      {step === 2 && (
        <div className="portal-sources__wizard-body">
          <div className="portal-sources__stat-grid">
            <StatTile label={t("sources.wizard.name")} value={name || "—"} />
            <StatTile label={t("sources.wizard.type")} value={type.label} />
            {type.fields.map((field) => (
              <StatTile
                key={field.key}
                label={field.label}
                value={options[field.key] || "—"}
              />
            ))}
          </div>
          {error && <Banner tone="danger" description={error} />}
        </div>
      )}
    </Modal>
  );
}
