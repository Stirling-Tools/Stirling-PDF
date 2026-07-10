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
  Select,
  Spinner,
} from "@app/ui";
import { errorMessage } from "@portal/api/http";
import {
  createSource,
  deleteSource,
  fetchSource,
  type Source,
} from "@portal/api/sources";
import { useAsync } from "@portal/hooks/useAsync";
import { VIEW_PATHS, toPortalPath } from "@portal/contexts/ViewContext";
import { creatableSourceTypes } from "@portal/components/sources/creatableSourceTypes";
import {
  CREATABLE_SOURCE_TYPES,
  defaultOptions,
  sourceTypeMeta,
  type CreatableSourceType,
} from "@portal/components/sources/sourceTypes";
import { S3ConnectionPicker } from "@portal/components/sources/S3ConnectionPicker";
import "@portal/views/SourceBuilder.css";

const OFFERED_TYPES = creatableSourceTypes();

/** A source's stored type resolved to its create-form metadata (edit falls back to any type). */
function typeFor(type: string | undefined): CreatableSourceType {
  return (
    CREATABLE_SOURCE_TYPES.find((t) => t.type === type) ??
    OFFERED_TYPES[0] ??
    CREATABLE_SOURCE_TYPES[0]
  );
}

/** Stored options coerced to form strings, defaulted from the type's fields. */
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
 * Full-page create/edit for a source, mirroring the pipeline builder: new lands
 * on /sources/new (with a type picker), a row opens /sources/:id prefilled.
 * Save and delete navigate back to the Sources list. The virtual editor source
 * is never routed here (the list row is not a link).
 */
export function SourceBuilder() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const listPath = toPortalPath(VIEW_PATHS.sources);

  const sourceState = useAsync<Source | null>(
    async () => (id ? await fetchSource(id) : null),
    [id],
  );

  const [type, setType] = useState<CreatableSourceType>(OFFERED_TYPES[0]);
  const [name, setName] = useState("");
  const [options, setOptions] = useState<Record<string, string>>(() =>
    defaultOptions(OFFERED_TYPES[0]),
  );
  const [enabled, setEnabled] = useState(true);
  const [seeded, setSeeded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Seed once: immediately for a new source, or after the record loads for edit.
  useEffect(() => {
    if (seeded) return;
    if (isEdit && !sourceState.data) return;
    const source = sourceState.data ?? undefined;
    const resolved = typeFor(source?.type);
    setType(resolved);
    setName(source?.name ?? "");
    setOptions(optionsFor(resolved, source?.options));
    setEnabled(source?.enabled ?? true);
    setSeeded(true);
  }, [isEdit, sourceState.data, seeded]);

  function chooseType(next: CreatableSourceType) {
    setType(next);
    setOptions(defaultOptions(next));
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
      await createSource({
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
      await deleteSource(id);
      navigate(listPath);
    } catch (e) {
      setError(errorMessage(e));
      setDeleting(false);
      setPendingDelete(false);
    }
  }

  if (isEdit && sourceState.error) {
    return (
      <div className="portal-source-builder">
        <Banner tone="danger" description={errorMessage(sourceState.error)} />
        <Button variant="tertiary" onClick={() => navigate(listPath)}>
          {t("portal.sources.builder.back")}
        </Button>
      </div>
    );
  }

  if (isEdit && !seeded) {
    return (
      <div className="portal-source-builder__loading">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="portal-source-builder">
      <header className="portal-source-builder__head">
        <div className="portal-source-builder__head-main">
          <Button
            variant="quiet"
            size="sm"
            onClick={() => navigate(listPath)}
            leftSection={
              <ArrowBackRoundedIcon style={{ fontSize: "1.125rem" }} />
            }
          >
            {t("portal.sources.builder.back")}
          </Button>
          <h1 className="portal-source-builder__title">
            {isEdit
              ? name || t("portal.sources.builder.editTitle")
              : t("portal.sources.builder.createTitle")}
          </h1>
        </div>
        <div className="portal-source-builder__head-actions">
          <Checkbox
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            label={t("portal.sources.builder.enabled")}
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
              {t("portal.sources.builder.delete")}
            </Button>
          )}
          <Button
            variant="tertiary"
            size="sm"
            onClick={() => navigate(listPath)}
          >
            {t("portal.sources.builder.cancel")}
          </Button>
          <Button size="sm" disabled={!canSave} onClick={() => void save()}>
            {isEdit
              ? t("portal.sources.builder.save")
              : t("portal.sources.builder.create")}
          </Button>
        </div>
      </header>

      <div className="portal-source-builder__body">
        <FormField label={t("portal.sources.wizard.name")} required>
          <Input
            value={name}
            placeholder={t("portal.sources.wizard.namePlaceholder")}
            onChange={(e) => setName(e.target.value)}
          />
        </FormField>

        {!isEdit && OFFERED_TYPES.length > 1 && (
          <FormField label={t("portal.sources.wizard.type")}>
            <div className="portal-source-builder__type-grid">
              {OFFERED_TYPES.map((ct) => (
                <Button
                  key={ct.type}
                  variant="tertiary"
                  className={
                    "portal-source-builder__type-card" +
                    (type.type === ct.type ? " is-selected" : "")
                  }
                  onClick={() => chooseType(ct)}
                >
                  <span
                    className="portal-source-builder__type-icon"
                    aria-hidden
                  >
                    {sourceTypeMeta(ct.type).icon}
                  </span>
                  <span className="portal-source-builder__type-name">
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
            ) : field.control === "select" ? (
              <Select
                value={options[field.key] ?? ""}
                options={(field.options ?? []).map((o) => ({
                  value: o.value,
                  label: t(o.labelKey),
                }))}
                onChange={(value) => setOption(field.key, value ?? "")}
              />
            ) : (
              <Input
                type={field.control === "password" ? "password" : undefined}
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
        title={t("portal.sources.delete.title")}
        footer={
          <div className="portal-source-builder__delete-actions">
            <Button
              variant="tertiary"
              size="sm"
              disabled={deleting}
              onClick={() => setPendingDelete(false)}
            >
              {t("portal.sources.delete.cancel")}
            </Button>
            <Button
              size="sm"
              accent="danger"
              loading={deleting}
              onClick={() => void confirmDelete()}
            >
              {t("portal.sources.delete.confirm")}
            </Button>
          </div>
        }
      >
        <p>{t("portal.sources.delete.body", { name })}</p>
      </Modal>
    </div>
  );
}
