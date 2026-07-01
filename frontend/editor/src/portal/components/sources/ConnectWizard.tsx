import { useEffect, useState } from "react";
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
import { errorMessage } from "@portal/api/http";
import { createSource, type Source } from "@portal/api/sources";
import {
  CREATABLE_SOURCE_TYPES,
  defaultOptions,
  sourceTypeMeta,
  type CreatableSourceType,
} from "@portal/components/sources/sourceTypes";
import "@portal/views/Sources.css";

const DEFAULT_TYPE = CREATABLE_SOURCE_TYPES[0];

/** Wizard steps. Editing skips type selection (the type is fixed once created). */
type StepId = "type" | "configure" | "review";
const CREATE_STEPS: StepId[] = ["type", "configure", "review"];
const EDIT_STEPS: StepId[] = ["configure", "review"];

interface ConnectWizardProps {
  open: boolean;
  onClose: () => void;
  /** Called after a source is created or updated so the page can refetch. */
  onCreated: () => void;
  /** When set, the wizard edits this existing source instead of creating one. */
  source?: Source;
}

/** The creatable-type metadata for a source's stored type, falling back to folder. */
function typeFor(type: string | undefined): CreatableSourceType {
  return CREATABLE_SOURCE_TYPES.find((t) => t.type === type) ?? DEFAULT_TYPE;
}

/** Source options coerced to strings for the form, defaulted from the type's fields. */
function optionsFor(
  type: CreatableSourceType,
  options: Record<string, unknown> | undefined,
): Record<string, string> {
  const out = defaultOptions(type);
  for (const [key, value] of Object.entries(options ?? {})) {
    out[key] = value == null ? "" : String(value);
  }
  return out;
}

/**
 * Guided flow for connecting a source (choose type -> configure -> review) or
 * editing an existing one (configure -> review, type fixed). On submit a blank
 * id creates and a set id updates, matching the backend's POST contract.
 */
export function ConnectWizard({
  open,
  onClose,
  onCreated,
  source,
}: ConnectWizardProps) {
  const { t } = useTranslation();
  const isEdit = source !== undefined;
  const steps = isEdit ? EDIT_STEPS : CREATE_STEPS;

  const [stepIndex, setStepIndex] = useState(0);
  const [type, setType] = useState<CreatableSourceType>(() =>
    typeFor(source?.type),
  );
  const [name, setName] = useState(source?.name ?? "");
  const [options, setOptions] = useState<Record<string, string>>(() =>
    optionsFor(typeFor(source?.type), source?.options),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed the form whenever the wizard opens (or its target source changes) so
  // editing prefills the current config and a reopened create starts clean.
  useEffect(() => {
    if (!open) return;
    const ct = typeFor(source?.type);
    setStepIndex(0);
    setType(ct);
    setName(source?.name ?? "");
    setOptions(optionsFor(ct, source?.options));
    setSubmitting(false);
    setError(null);
  }, [open, source]);

  const stepId = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;

  function chooseType(next: CreatableSourceType) {
    setType(next);
    setOptions(defaultOptions(next));
  }

  const requiredFilled = type.fields.every(
    (f) => !f.required || (options[f.key] ?? "").trim() !== "",
  );
  const canContinue =
    stepId === "configure" ? name.trim() !== "" && requiredFilled : true;

  async function advance() {
    if (!isLast) {
      setStepIndex((i) => i + 1);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const fields = {
        name: name.trim(),
        type: type.type,
        options,
        enabled: source?.enabled ?? true,
      };
      await createSource(isEdit ? { ...fields, id: source.id } : fields);
      onCreated();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  const stepLabels: Record<StepId, string> = {
    type: t("sources.wizard.steps.chooseType"),
    configure: t("sources.wizard.steps.configure"),
    review: t("sources.wizard.steps.review"),
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="lg"
      title={isEdit ? t("sources.wizard.editTitle") : t("sources.wizard.title")}
      subtitle={t("sources.wizard.subtitle", {
        current: stepIndex + 1,
        total: steps.length,
        label: stepLabels[stepId],
      })}
      footer={
        <div className="portal-sources__wizard-footer">
          <Button
            variant="ghost"
            size="sm"
            disabled={submitting}
            onClick={() =>
              stepIndex === 0 ? onClose() : setStepIndex((i) => i - 1)
            }
          >
            {stepIndex === 0
              ? t("sources.wizard.cancel")
              : t("sources.wizard.back")}
          </Button>
          <Button
            size="sm"
            onClick={advance}
            loading={submitting}
            disabled={!canContinue}
            trailingIcon={!isLast ? <span aria-hidden>→</span> : undefined}
          >
            {!isLast
              ? t("sources.wizard.continue")
              : isEdit
                ? t("sources.wizard.save")
                : t("sources.actions.connectSource")}
          </Button>
        </div>
      }
    >
      <ol className="portal-sources__steps" aria-hidden>
        {steps.map((id, i) => (
          <li
            key={id}
            className={
              "portal-sources__step" +
              (i === stepIndex ? " is-active" : i < stepIndex ? " is-done" : "")
            }
          >
            <span className="portal-sources__step-mark">
              {i < stepIndex ? "✓" : i + 1}
            </span>
            {stepLabels[id]}
          </li>
        ))}
      </ol>

      {stepId === "type" && (
        <div className="portal-sources__type-grid">
          {CREATABLE_SOURCE_TYPES.map((ct) => (
            <button
              key={ct.type}
              type="button"
              className={
                "portal-sources__type-card" +
                (type.type === ct.type ? " is-selected" : "")
              }
              onClick={() => chooseType(ct)}
            >
              <span className="portal-sources__type-icon" aria-hidden>
                {sourceTypeMeta(ct.type).icon}
              </span>
              <span className="portal-sources__type-name">
                {t(ct.labelKey)}
              </span>
            </button>
          ))}
        </div>
      )}

      {stepId === "configure" && (
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
              label={t(field.labelKey)}
              helperText={
                field.helperTextKey ? t(field.helperTextKey) : undefined
              }
              required={field.required}
            >
              {field.control === "select" ? (
                <Select
                  value={options[field.key] ?? ""}
                  options={(field.options ?? []).map((o) => ({
                    value: o.value,
                    label: t(o.labelKey),
                  }))}
                  onChange={(e) =>
                    setOptions((o) => ({ ...o, [field.key]: e.target.value }))
                  }
                />
              ) : (
                <Input
                  value={options[field.key] ?? ""}
                  placeholder={
                    field.placeholderKey ? t(field.placeholderKey) : undefined
                  }
                  onChange={(e) =>
                    setOptions((o) => ({ ...o, [field.key]: e.target.value }))
                  }
                />
              )}
            </FormField>
          ))}
        </div>
      )}

      {stepId === "review" && (
        <div className="portal-sources__wizard-body">
          <div className="portal-sources__stat-grid">
            <StatTile label={t("sources.wizard.name")} value={name || "—"} />
            <StatTile
              label={t("sources.wizard.type")}
              value={t(type.labelKey)}
            />
            {type.fields.map((field) => (
              <StatTile
                key={field.key}
                label={t(field.labelKey)}
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
