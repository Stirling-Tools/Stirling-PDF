import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button, FormField, Input, Modal, RadioGroup } from "@app/ui";
import { errorMessage } from "@portal/api/http";
import { createOutput, type Output } from "@portal/api/outputs";
import { availableOutputModes } from "@portal/components/pipelines/outputModes";
import {
  creatableOutputType,
  type OutputFieldDef,
} from "@portal/components/outputs/outputTypes";
import { S3ConnectionPicker } from "@portal/components/sources/S3ConnectionPicker";

/**
 * Create/edit an output destination. Launched from the Outputs tab and the
 * pipeline builder's output picker, so setting up a destination is always a
 * modal. Saving validates backend-side (folder path allowlist, S3 connection
 * access); the caller receives the stored output to select or refresh it.
 */
interface OutputModalProps {
  open: boolean;
  /** When set, edit this output; otherwise create a new one. */
  output?: Output | null;
  onClose: () => void;
  /** The saved output, so callers can select or refresh it. */
  onSaved: (output: Output) => void;
}

const DEFAULT_TYPE = availableOutputModes()[0];

export function OutputModal({
  open,
  output,
  onClose,
  onSaved,
}: OutputModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [type, setType] = useState<string>(DEFAULT_TYPE);
  const [options, setOptions] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = Boolean(output);

  // Seed the form each time the modal opens (or its target changes).
  useEffect(() => {
    if (!open) return;
    if (output) {
      setName(output.name);
      setType(output.type);
      const seeded: Record<string, string> = {};
      for (const [key, value] of Object.entries(output.options ?? {})) {
        seeded[key] = String(value ?? "");
      }
      setOptions(seeded);
    } else {
      setName("");
      setType(DEFAULT_TYPE);
      setOptions({});
    }
    setError(null);
  }, [open, output]);

  const spec = useMemo(() => creatableOutputType(type), [type]);

  const valid =
    name.trim() !== "" &&
    spec !== undefined &&
    spec.fields.every(
      (field) => !field.required || (options[field.key] ?? "").trim() !== "",
    );

  function setOption(key: string, value: string) {
    setOptions((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    if (saving || !valid) return;
    setSaving(true);
    setError(null);
    try {
      const trimmed: Record<string, string> = {};
      for (const [key, value] of Object.entries(options)) {
        if (value.trim() !== "") trimmed[key] = value.trim();
      }
      const saved = await createOutput({
        id: output?.id,
        name: name.trim(),
        type,
        options: trimmed,
        enabled: output?.enabled ?? true,
      });
      onSaved(saved);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t(
        isEdit ? "portal.outputs.editTitle" : "portal.outputs.createTitle",
      )}
      footer={
        <div className="portal-sources__connection-create-actions">
          <Button
            variant="tertiary"
            size="sm"
            disabled={saving}
            onClick={onClose}
          >
            {t("portal.outputs.form.cancel")}
          </Button>
          <Button
            size="sm"
            loading={saving}
            disabled={!valid}
            onClick={() => void save()}
          >
            {t("portal.outputs.form.save")}
          </Button>
        </div>
      }
    >
      <FormField label={t("portal.outputs.form.nameLabel")} required>
        <Input
          value={name}
          placeholder={t("portal.outputs.form.namePlaceholder")}
          onChange={(e) => setName(e.target.value)}
        />
      </FormField>

      {/* Type is fixed once created: the stored destination shape can't change under a policy. */}
      {!isEdit && (
        <FormField label={t("portal.outputs.form.typeLabel")}>
          <RadioGroup<string>
            name="output-type"
            value={type}
            onChange={setType}
            options={availableOutputModes().map((mode) => ({
              value: mode,
              label: t(`portal.outputs.types.${mode}.label`),
            }))}
          />
        </FormField>
      )}

      {spec?.fields.map((field: OutputFieldDef) => (
        <FormField
          key={field.key}
          label={t(field.labelKey)}
          helperText={field.helperTextKey ? t(field.helperTextKey) : undefined}
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
    </Modal>
  );
}
