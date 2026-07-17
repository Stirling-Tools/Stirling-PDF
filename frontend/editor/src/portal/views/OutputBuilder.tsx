import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import {
  Banner,
  Button,
  Checkbox,
  FormField,
  Input,
  Modal,
  Spinner,
} from "@app/ui";
import { errorMessage } from "@portal/api/http";
import {
  createOutput,
  deleteOutput,
  fetchOutput,
  type Output,
} from "@portal/api/outputs";
import { useAsync } from "@portal/hooks/useAsync";
import { VIEW_PATHS, toPortalPath } from "@portal/contexts/ViewContext";
import {
  creatableOutputTypes,
  defaultOutputOptions,
  outputTypeMeta,
  type CreatableOutputType,
} from "@portal/components/outputs/outputTypes";
import { S3ConnectionPicker } from "@portal/components/sources/S3ConnectionPicker";
import "@portal/views/OutputBuilder.css";

const OFFERED_TYPES = creatableOutputTypes();

/** An output's stored type resolved to its create-form metadata. */
function typeFor(type: string | undefined): CreatableOutputType {
  return OFFERED_TYPES.find((t) => t.type === type) ?? OFFERED_TYPES[0];
}

/** Stored options coerced to form strings, defaulted from the type's fields. */
function optionsFor(
  type: CreatableOutputType,
  options: Record<string, unknown> | undefined,
): Record<string, string> {
  const out = defaultOutputOptions(type);
  for (const [key, value] of Object.entries(options ?? {})) {
    out[key] = value == null ? "" : String(value);
  }
  return out;
}

/**
 * Full-page create/edit for an output destination, mirroring {@link SourceBuilder}:
 * new lands on /sources/outputs/new (with a type picker), a row opens
 * /sources/outputs/:id prefilled. Save and delete return to the Outputs tab. The
 * type is fixed once created - the stored destination shape can't change under a
 * policy that references it.
 */
export function OutputBuilder() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const listPath = `${toPortalPath(VIEW_PATHS.sources)}?tab=outputs`;

  const outputState = useAsync<Output | null>(
    async () => (id ? await fetchOutput(id) : null),
    [id],
  );

  const [type, setType] = useState<CreatableOutputType>(OFFERED_TYPES[0]);
  const [name, setName] = useState("");
  const [options, setOptions] = useState<Record<string, string>>(() =>
    defaultOutputOptions(OFFERED_TYPES[0]),
  );
  const [enabled, setEnabled] = useState(true);
  const [seeded, setSeeded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Seed once: immediately for a new output, or after the record loads for edit.
  useEffect(() => {
    if (seeded) return;
    if (isEdit && !outputState.data) return;
    const output = outputState.data ?? undefined;
    const resolved = typeFor(output?.type);
    setType(resolved);
    setName(output?.name ?? "");
    setOptions(optionsFor(resolved, output?.options));
    setEnabled(output?.enabled ?? true);
    setSeeded(true);
  }, [isEdit, outputState.data, seeded]);

  function chooseType(next: CreatableOutputType) {
    setType(next);
    setOptions(defaultOutputOptions(next));
  }

  function setOption(key: string, value: string) {
    setOptions((current) => ({ ...current, [key]: value }));
  }

  const requiredComplete = type.fields.every(
    (field) => !field.required || (options[field.key] ?? "").trim() !== "",
  );
  const canSave = name.trim() !== "" && requiredComplete && !submitting;

  async function save() {
    if (!canSave) return;
    setSubmitting(true);
    setError(null);
    try {
      await createOutput({
        id: isEdit ? id : undefined,
        name: name.trim(),
        type: type.type,
        options,
        enabled,
      });
      navigate(listPath);
    } catch (e) {
      setError(errorMessage(e));
      setSubmitting(false);
    }
  }

  async function confirmDelete() {
    if (!id || deleting) return;
    setDeleting(true);
    try {
      await deleteOutput(id);
      navigate(listPath);
    } catch (e) {
      // A referenced output returns 409; surface it and stay on the page.
      setError(errorMessage(e));
      setDeleting(false);
      setPendingDelete(false);
    }
  }

  if (isEdit && outputState.error) {
    return (
      <div className="portal-output-builder">
        <Banner tone="danger" description={errorMessage(outputState.error)} />
        <Button variant="tertiary" onClick={() => navigate(listPath)}>
          {t("portal.outputs.builder.back")}
        </Button>
      </div>
    );
  }

  if (isEdit && !seeded) {
    return (
      <div className="portal-output-builder__loading">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="portal-output-builder">
      <header className="portal-output-builder__head">
        <div className="portal-output-builder__head-main">
          <Button
            variant="quiet"
            size="sm"
            onClick={() => navigate(listPath)}
            leftSection={
              <ArrowBackRoundedIcon style={{ fontSize: "1.125rem" }} />
            }
          >
            {t("portal.outputs.builder.back")}
          </Button>
          <h1 className="portal-output-builder__title">
            {isEdit
              ? name || t("portal.outputs.builder.editTitle")
              : t("portal.outputs.builder.createTitle")}
          </h1>
        </div>
        <div className="portal-output-builder__head-actions">
          <Checkbox
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            label={t("portal.outputs.builder.enabled")}
          />
          {isEdit && (
            <Button
              variant="secondary"
              size="sm"
              accent="danger"
              onClick={() => setPendingDelete(true)}
              leftSection={
                <DeleteOutlineRoundedIcon style={{ fontSize: "1.125rem" }} />
              }
            >
              {t("portal.outputs.builder.delete")}
            </Button>
          )}
          <Button
            variant="tertiary"
            size="sm"
            onClick={() => navigate(listPath)}
          >
            {t("portal.outputs.builder.cancel")}
          </Button>
          <Button size="sm" disabled={!canSave} onClick={() => void save()}>
            {isEdit
              ? t("portal.outputs.builder.save")
              : t("portal.outputs.builder.create")}
          </Button>
        </div>
      </header>

      <div className="portal-output-builder__body">
        <FormField label={t("portal.outputs.builder.name")} required>
          <Input
            value={name}
            placeholder={t("portal.outputs.builder.namePlaceholder")}
            onChange={(e) => setName(e.target.value)}
          />
        </FormField>

        {/* Type is fixed once created: the stored destination shape can't change under a policy. */}
        {!isEdit && OFFERED_TYPES.length > 1 && (
          <FormField label={t("portal.outputs.builder.type")}>
            <div className="portal-output-builder__type-grid">
              {OFFERED_TYPES.map((ct) => (
                <Button
                  key={ct.type}
                  variant="tertiary"
                  className={
                    "portal-output-builder__type-card" +
                    (type.type === ct.type ? " is-selected" : "")
                  }
                  onClick={() => chooseType(ct)}
                >
                  <span
                    className="portal-output-builder__type-icon"
                    aria-hidden
                  >
                    {outputTypeMeta(ct.type).icon}
                  </span>
                  <span className="portal-output-builder__type-name">
                    {t(ct.labelKey)}
                  </span>
                </Button>
              ))}
            </div>
          </FormField>
        )}

        {type.fields.map((field) => (
          <FormField
            key={field.key}
            label={t(field.labelKey)}
            helperText={
              field.helperTextKey ? t(field.helperTextKey) : undefined
            }
            required={field.required}
          >
            {field.control === "s3Connection" ? (
              <S3ConnectionPicker
                value={options[field.key] ?? ""}
                onChange={(connectionId) => setOption(field.key, connectionId)}
              />
            ) : (
              <Input
                value={options[field.key] ?? ""}
                placeholder={
                  field.placeholderKey ? t(field.placeholderKey) : undefined
                }
                onChange={(e) => setOption(field.key, e.target.value)}
              />
            )}
          </FormField>
        ))}

        {error && <Banner tone="danger" description={error} />}
      </div>

      <Modal
        open={pendingDelete}
        onClose={() => !deleting && setPendingDelete(false)}
        width="sm"
        title={t("portal.outputs.delete.title")}
        footer={
          <div className="portal-output-builder__delete-actions">
            <Button
              variant="tertiary"
              size="sm"
              disabled={deleting}
              onClick={() => setPendingDelete(false)}
            >
              {t("portal.outputs.delete.cancel")}
            </Button>
            <Button
              size="sm"
              accent="danger"
              loading={deleting}
              onClick={() => void confirmDelete()}
            >
              {t("portal.outputs.delete.confirm")}
            </Button>
          </div>
        }
      >
        <p>{t("portal.outputs.delete.body", { name })}</p>
      </Modal>
    </div>
  );
}
