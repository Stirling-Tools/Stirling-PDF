import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
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
import { errorMessage } from "@processor/api/http";
import {
  createSource,
  deleteSource,
  fetchSource,
  isFolderAccessDeniedError,
  type Source,
} from "@processor/api/sources";
import { useUI } from "@processor/contexts/UIContext";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "@processor/queries/keys";
import { creatableSourceTypes } from "@processor/components/sources/creatableSourceTypes";
import {
  COMING_SOON_SOURCE_TYPES,
  CREATABLE_SOURCE_TYPES,
  defaultOptions,
  WEBHOOK_SOURCE_TYPE,
  type CreatableSourceType,
} from "@processor/components/sources/sourceTypes";
import { BrandMark } from "@processor/components/BrandMarks";
import { S3ConnectionPicker } from "@processor/components/sources/S3ConnectionPicker";
import { ConnectionPicker } from "@processor/components/sources/ConnectionPicker";
import { ConnectionForm } from "@processor/components/sources/ConnectionForm";
import {
  CREATABLE_CONNECTION_TYPES,
  buildConnectionConfig,
  connectionFormValid,
  emptyConnectionValues,
  type CreatableConnectionType,
} from "@processor/components/sources/connectionTypes";
import { createIntegration } from "@processor/api/integrations";
import "@processor/components/sources/SourceModal.css";

function webhookUrl(webhookId: string): string {
  return `${window.location.origin}/api/v1/webhooks/${webhookId}`;
}

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

type Stage = "type" | "configure" | "reveal" | "delete" | "connection";

/** The S3 catalogue entry, for creating a connection in-place (no stacked modal). */
const S3_CONNECTION_TYPE = CREATABLE_CONNECTION_TYPES.find(
  (entry) => entry.id === "s3",
)!;

/** A connection-catalogue entry by id, for the inline create form a source field opens. */
function connectionTypeById(id: string): CreatableConnectionType {
  return (
    CREATABLE_CONNECTION_TYPES.find((entry) => entry.id === id) ??
    S3_CONNECTION_TYPE
  );
}

interface SourceModalProps {
  open: boolean;
  /** When set, edit this source; otherwise create a new one. */
  sourceId?: string | null;
  onClose: () => void;
  /**
   * Fired after a save or delete. The shared sources query is invalidated here
   * regardless, so hosts on the query layer need no handler.
   */
  onSaved?: () => void;
}

/**
 * Create/edit a source, staged inside one modal: the connector catalogue first
 * (including greyed-out coming-soon entries), then the configure form for the
 * picked type; webhook creation swaps to a one-time secret reveal, and delete
 * swaps to an inline confirm rather than stacking a second modal.
 */
export function SourceModal({
  open,
  sourceId,
  onClose,
  onSaved,
}: SourceModalProps) {
  const { t } = useTranslation();
  const { openSettings } = useUI();
  const queryClient = useQueryClient();
  const isEdit = Boolean(sourceId);

  // The list is a shared cache entry (Sources view + Home's ProcessorFlow), so
  // a create/delete here must invalidate it before the host re-renders it.
  const invalidateSources = () =>
    queryClient.invalidateQueries({ queryKey: qk.sources() });

  const [stage, setStage] = useState<Stage>("type");
  const [type, setType] = useState<CreatableSourceType>(OFFERED_TYPES[0]);
  const [name, setName] = useState("");
  const [options, setOptions] = useState<Record<string, string>>(() =>
    defaultOptions(OFFERED_TYPES[0]),
  );
  const [enabled, setEnabled] = useState(true);
  const [loaded, setLoaded] = useState<Source | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A folder-outside-allowed-roots failure: the error banner offers a link to
  // the Folder Access settings instead of leaving the admin at a dead end.
  const [folderAccessDenied, setFolderAccessDenied] = useState(false);
  const [reveal, setReveal] = useState<{
    webhookId: string;
    secret: string;
  } | null>(null);
  // In-place connection create (swaps the stage; never stacks a second modal). The type is set
  // per field, so a source that wants an SFTP connection opens the SFTP form, not always S3.
  const [connType, setConnType] =
    useState<CreatableConnectionType>(S3_CONNECTION_TYPE);
  const [connValues, setConnValues] = useState<Record<string, string>>(() =>
    emptyConnectionValues(S3_CONNECTION_TYPE),
  );
  const [connField, setConnField] = useState("");
  const [connSaving, setConnSaving] = useState(false);

  // Seed on every open: fresh catalogue for create, fetched record for edit.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setReveal(null);
    setSubmitting(false);
    setDeleting(false);
    if (!sourceId) {
      setStage("type");
      setType(OFFERED_TYPES[0]);
      setName("");
      setOptions(defaultOptions(OFFERED_TYPES[0]));
      setEnabled(true);
      setLoaded(null);
      return;
    }
    setStage("configure");
    setLoading(true);
    fetchSource(sourceId)
      .then((source) => {
        const resolved = typeFor(source.type);
        setLoaded(source);
        setType(resolved);
        setName(source.name ?? "");
        setOptions(optionsFor(resolved, source.options));
        setEnabled(source.enabled ?? true);
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, [open, sourceId]);

  function chooseType(next: CreatableSourceType) {
    setType(next);
    setOptions(defaultOptions(next));
    setStage("configure");
  }

  function setOption(key: string, value: string) {
    setOptions((current) => ({ ...current, [key]: value }));
  }

  const requiredComplete = type.fields.every(
    (field) => !field.required || (options[field.key] ?? "").trim() !== "",
  );
  const canSave = name.trim() !== "" && requiredComplete && !submitting;

  const editingWebhookId =
    isEdit && loaded?.type === WEBHOOK_SOURCE_TYPE
      ? String(loaded.options?.webhookId ?? "")
      : "";

  function finish() {
    onSaved?.();
    onClose();
  }

  function openConnectionStage(
    fieldKey: string,
    type: CreatableConnectionType,
  ) {
    setConnType(type);
    setConnValues(emptyConnectionValues(type));
    setConnField(fieldKey);
    setError(null);
    setStage("connection");
  }

  async function saveConnection() {
    if (connSaving || !connectionFormValid(connType, connValues)) return;
    setConnSaving(true);
    setError(null);
    try {
      const created = await createIntegration({
        integrationType: connType.integrationType,
        name: connValues.name.trim(),
        scope: "TEAM",
        config: buildConnectionConfig(connType, connValues),
      });
      // Back to the source form with the fresh connection selected; the picker
      // remounts and refetches, so the new name is in its list.
      setOption(connField, String(created.id));
      setStage("configure");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setConnSaving(false);
    }
  }

  async function save() {
    if (!canSave) return;
    setSubmitting(true);
    setError(null);
    setFolderAccessDenied(false);
    try {
      const saved = await createSource({
        id: isEdit ? (sourceId ?? undefined) : undefined,
        name: name.trim(),
        type: type.type,
        options,
        enabled,
      });
      await invalidateSources();
      if (!isEdit && type.type === WEBHOOK_SOURCE_TYPE) {
        const webhookId = String(saved.options?.webhookId ?? "");
        const secret = String(saved.options?.signingSecret ?? "");
        if (webhookId && secret) {
          setReveal({ webhookId, secret });
          setStage("reveal");
          setSubmitting(false);
          return;
        }
      }
      finish();
    } catch (e) {
      setError(errorMessage(e));
      setFolderAccessDenied(isFolderAccessDeniedError(e));
      setSubmitting(false);
    }
  }

  async function confirmDelete() {
    if (!sourceId || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteSource(sourceId);
      await invalidateSources();
      finish();
    } catch (e) {
      setError(errorMessage(e));
      setDeleting(false);
    }
  }

  function copy(text: string) {
    void navigator.clipboard?.writeText(text);
  }

  const title =
    stage === "type"
      ? t("processor.sources.builder.createTitle")
      : stage === "connection"
        ? t("processor.connections.createTitleFor", {
            name: t(connType.labelKey),
          })
        : stage === "reveal"
          ? t("processor.sources.types.webhook.reveal.title")
          : stage === "delete"
            ? t("processor.sources.delete.title")
            : isEdit
              ? name || t("processor.sources.builder.editTitle")
              : t("processor.sources.builder.createTitle");

  return (
    <Modal
      open={open}
      onClose={stage === "reveal" ? finish : onClose}
      width={stage === "type" ? "lg" : stage === "delete" ? "sm" : "md"}
      title={title}
      footer={
        stage === "configure" ? (
          <div className="processor-source-modal__footer">
            <Checkbox
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              label={t("processor.sources.builder.enabled")}
            />
            <span className="processor-source-modal__footer-actions">
              {isEdit && (
                <Button
                  variant="tertiary"
                  size="sm"
                  accent="danger"
                  disabled={submitting}
                  onClick={() => setStage("delete")}
                >
                  {t("processor.sources.builder.delete")}
                </Button>
              )}
              <Button
                variant="tertiary"
                size="sm"
                disabled={submitting}
                onClick={onClose}
              >
                {t("processor.sources.builder.cancel")}
              </Button>
              <Button
                size="sm"
                loading={submitting}
                disabled={!canSave}
                onClick={() => void save()}
              >
                {isEdit
                  ? t("processor.sources.builder.save")
                  : t("processor.sources.builder.create")}
              </Button>
            </span>
          </div>
        ) : stage === "connection" ? (
          <div className="processor-source-modal__footer-actions">
            <Button
              variant="tertiary"
              size="sm"
              disabled={connSaving}
              onClick={() => setStage("configure")}
            >
              {t("processor.connections.picker.cancel")}
            </Button>
            <Button
              size="sm"
              loading={connSaving}
              disabled={!connectionFormValid(connType, connValues)}
              onClick={() => void saveConnection()}
            >
              {t("processor.connections.picker.save")}
            </Button>
          </div>
        ) : stage === "reveal" ? (
          <div className="processor-source-modal__footer-actions">
            <Button size="sm" onClick={finish}>
              {t("processor.sources.types.webhook.reveal.done")}
            </Button>
          </div>
        ) : stage === "delete" ? (
          <div className="processor-source-modal__footer-actions">
            <Button
              variant="tertiary"
              size="sm"
              disabled={deleting}
              onClick={() => setStage("configure")}
            >
              {t("processor.sources.delete.cancel")}
            </Button>
            <Button
              size="sm"
              accent="danger"
              loading={deleting}
              onClick={() => void confirmDelete()}
            >
              {t("processor.sources.delete.confirm")}
            </Button>
          </div>
        ) : undefined
      }
    >
      {stage === "type" && (
        <div className="processor-source-modal__catalog">
          <p className="processor-source-modal__hint">
            {t("processor.sources.builder.chooseHint")}
          </p>
          <div
            className="processor-source-modal__grid"
            role="listbox"
            aria-label={t("processor.sources.wizard.type")}
          >
            {OFFERED_TYPES.map((ct) => (
              <button
                key={ct.type}
                type="button"
                role="option"
                aria-selected={false}
                className="processor-source-modal__card"
                onClick={() => chooseType(ct)}
              >
                <span className="processor-source-modal__card-icon" aria-hidden>
                  <BrandMark id={ct.type} size={22} />
                </span>
                <span className="processor-source-modal__card-text">
                  <span className="processor-source-modal__card-name">
                    {t(ct.labelKey)}
                  </span>
                  <span className="processor-source-modal__card-desc">
                    {t(ct.descriptionKey)}
                  </span>
                </span>
              </button>
            ))}
          </div>

          <h3 className="processor-source-modal__soon-title">
            {t("processor.sources.builder.comingSoonHeading")}
          </h3>
          <div className="processor-source-modal__grid">
            {COMING_SOON_SOURCE_TYPES.map((ct) => (
              <div
                key={ct.type}
                className="processor-source-modal__card processor-source-modal__card--soon"
                aria-disabled
              >
                <span className="processor-source-modal__card-icon" aria-hidden>
                  <BrandMark id={ct.type} size={22} />
                </span>
                <span className="processor-source-modal__card-text">
                  <span className="processor-source-modal__card-name">
                    {t(ct.labelKey)}
                    <span className="processor-source-modal__soon-badge">
                      {t("processor.sources.builder.comingSoon")}
                    </span>
                  </span>
                  <span className="processor-source-modal__card-desc">
                    {t(ct.descriptionKey)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {stage === "configure" && (
        <div className="processor-source-modal__form">
          {loading && (
            <div className="processor-source-modal__loading">
              <Spinner />
            </div>
          )}

          {!loading && (
            <>
              {!isEdit && (
                <Button
                  variant="quiet"
                  size="sm"
                  className="processor-source-modal__back"
                  leftSection={<ArrowBackRoundedIcon fontSize="inherit" />}
                  onClick={() => setStage("type")}
                >
                  {t("processor.sources.builder.backToTypes")}
                </Button>
              )}

              <div className="processor-source-modal__type-summary">
                <BrandMark id={type.type} size={22} />
                <span className="processor-source-modal__card-text">
                  <span className="processor-source-modal__card-name">
                    {t(type.labelKey)}
                  </span>
                  <span className="processor-source-modal__card-desc">
                    {t(type.descriptionKey)}
                  </span>
                </span>
              </div>

              <FormField
                label={t("processor.integrations.typedName", {
                  tool: t(type.labelKey),
                })}
                required
              >
                <Input
                  value={name}
                  placeholder={t("processor.sources.wizard.namePlaceholder")}
                  onChange={(e) => setName(e.target.value)}
                />
              </FormField>

              {!isEdit && type.type === WEBHOOK_SOURCE_TYPE && (
                <p className="processor-source-modal__muted">
                  {t("processor.sources.types.webhook.createNote")}
                </p>
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
                      onChange={(connectionId) =>
                        setOption(field.key, connectionId)
                      }
                      onCreateNew={() =>
                        openConnectionStage(field.key, S3_CONNECTION_TYPE)
                      }
                    />
                  ) : field.control === "connection" ? (
                    <ConnectionPicker
                      value={options[field.key] ?? ""}
                      onChange={(connectionId) =>
                        setOption(field.key, connectionId)
                      }
                      integrationType={
                        connectionTypeById(field.connectionTypeId ?? "")
                          .integrationType
                      }
                      createTypeId={field.connectionTypeId ?? ""}
                      presetId={field.connectionTypeId}
                      onCreateNew={() =>
                        openConnectionStage(
                          field.key,
                          connectionTypeById(field.connectionTypeId ?? ""),
                        )
                      }
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
                      type={
                        field.control === "password" ? "password" : undefined
                      }
                      value={options[field.key] ?? ""}
                      placeholder={
                        field.placeholderKey
                          ? t(field.placeholderKey)
                          : undefined
                      }
                      onChange={(e) => setOption(field.key, e.target.value)}
                    />
                  )}
                </FormField>
              ))}

              {editingWebhookId && (
                <FormField
                  label={t(
                    "processor.sources.types.webhook.detail.deliveryUrl",
                  )}
                  helperText={t(
                    "processor.sources.types.webhook.detail.secretNote",
                  )}
                >
                  <div className="processor-source-modal__copy-row">
                    <Input
                      value={webhookUrl(editingWebhookId)}
                      readOnly
                      onFocus={(e) => e.currentTarget.select()}
                    />
                    <Button
                      variant="tertiary"
                      size="sm"
                      onClick={() => copy(webhookUrl(editingWebhookId))}
                    >
                      {t("processor.sources.types.webhook.reveal.copy")}
                    </Button>
                  </div>
                </FormField>
              )}

              {error &&
                (folderAccessDenied ? (
                  <Banner
                    tone="danger"
                    title={t("processor.sources.builder.folderAccess.title")}
                    description={t(
                      "processor.sources.builder.folderAccess.description",
                    )}
                    action={
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => openSettings("adminFolderAccess")}
                      >
                        {t(
                          "processor.sources.builder.folderAccess.openSettings",
                        )}
                      </Button>
                    }
                  />
                ) : (
                  <Banner tone="danger" description={error} />
                ))}
            </>
          )}
        </div>
      )}

      {stage === "connection" && (
        <div className="processor-source-modal__form">
          <ConnectionForm
            type={connType}
            values={connValues}
            onChange={setConnValues}
          />
          {error && <Banner tone="danger" description={error} />}
        </div>
      )}

      {stage === "reveal" && reveal && (
        <div className="processor-source-modal__form">
          <Banner
            tone="warning"
            description={t(
              "processor.sources.types.webhook.reveal.secretWarning",
            )}
          />
          <FormField label={t("processor.sources.types.webhook.reveal.url")}>
            <div className="processor-source-modal__copy-row">
              <Input
                value={webhookUrl(reveal.webhookId)}
                readOnly
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button
                variant="tertiary"
                size="sm"
                onClick={() => copy(webhookUrl(reveal.webhookId))}
              >
                {t("processor.sources.types.webhook.reveal.copy")}
              </Button>
            </div>
          </FormField>
          <FormField
            label={t("processor.sources.types.webhook.reveal.secret")}
            helperText={t("processor.sources.types.webhook.reveal.secretHelp")}
          >
            <div className="processor-source-modal__copy-row">
              <Input
                value={reveal.secret}
                readOnly
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button
                variant="tertiary"
                size="sm"
                onClick={() => copy(reveal.secret)}
              >
                {t("processor.sources.types.webhook.reveal.copy")}
              </Button>
            </div>
          </FormField>
          <p className="processor-source-modal__muted">
            {t("processor.sources.types.webhook.reveal.usage")}
          </p>
        </div>
      )}

      {stage === "delete" && (
        <div className="processor-source-modal__form">
          <p>{t("processor.sources.delete.body", { name })}</p>
          {error && <Banner tone="danger" description={error} />}
        </div>
      )}
    </Modal>
  );
}
