import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, FormField, Input, Modal, Select, ToggleSwitch } from "@app/ui";
import {
  createIntegration,
  updateIntegration,
  type IntegrationConfig,
  type IntegrationConfigRequest,
} from "@portal/api/integrations";
import { errorMessage } from "@portal/api/http";
import {
  SCOPE_OPTIONS,
  TYPE_FIELDS,
  defaultAccessForScope,
  type ScopeOption,
} from "@portal/components/integrations/integrationTypes";
import "@portal/views/Integrations.css";

type FormType = "API" | "MCP";
type FormScope = ScopeOption["value"];

interface IntegrationEditorModalProps {
  open: boolean;
  /** null = create; otherwise edit this config. */
  config: IntegrationConfig | null;
  onClose: () => void;
  onSaved: () => void;
}

const TYPE_OPTIONS: { value: FormType; label: string }[] = [
  { value: "API", label: "API connection" },
  { value: "MCP", label: "MCP server" },
];

/** Create or edit an API/MCP integration config with typed, per-type fields. */
export function IntegrationEditorModal({
  open,
  config,
  onClose,
  onSaved,
}: IntegrationEditorModalProps) {
  const { t } = useTranslation();
  const isEdit = config !== null;

  const [type, setType] = useState<FormType>("API");
  const [name, setName] = useState("");
  const [scope, setScope] = useState<FormScope>("USER");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed the form whenever the modal opens (create = blank; edit = the config).
  useEffect(() => {
    if (!open) return;
    if (config) {
      const t0 = (config.integrationType === "MCP" ? "MCP" : "API") as FormType;
      setType(t0);
      setName(config.name);
      setScope(config.scope === "SERVER" ? "SERVER" : "USER");
      setEnabled(config.enabled);
      // Non-secret fields prefill; secrets start blank ("keep" on save).
      const seed: Record<string, string> = {};
      for (const f of TYPE_FIELDS[t0]) {
        seed[f.key] = f.secret ? "" : String(config.config?.[f.key] ?? "");
      }
      setFields(seed);
    } else {
      setType("API");
      setName("");
      setScope("USER");
      setEnabled(true);
      setFields({});
    }
    setError(null);
  }, [open, config]);

  const defs = TYPE_FIELDS[type];

  function close() {
    onClose();
  }

  async function submit() {
    setError(null);
    if (!name.trim()) {
      setError(t("integrations.form.nameRequired", "Name is required"));
      return;
    }
    for (const f of defs) {
      if (f.required && !fields[f.key]?.trim()) {
        setError(
          t("integrations.form.fieldRequired", "{{field}} is required", {
            field: f.label,
          }),
        );
        return;
      }
    }
    const configObj: Record<string, string> = {};
    for (const f of defs) configObj[f.key] = fields[f.key] ?? "";

    setSaving(true);
    try {
      if (isEdit && config) {
        const body: IntegrationConfigRequest = {
          name: name.trim(),
          enabled,
          config: configObj,
        };
        await updateIntegration(config.id, body);
      } else {
        const body: IntegrationConfigRequest = {
          integrationType: type,
          name: name.trim(),
          scope,
          enabled,
          defaultAccess: defaultAccessForScope(scope),
          config: configObj,
        };
        await createIntegration(body);
      }
      onSaved();
      close();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const scopeHint = SCOPE_OPTIONS.find((s) => s.value === scope)?.hint;

  return (
    <Modal
      open={open}
      onClose={close}
      width="sm"
      title={
        isEdit
          ? t("integrations.form.editTitle", "Edit integration")
          : t("integrations.form.addTitle", "Add integration")
      }
      subtitle={
        isEdit
          ? t("integrations.form.editSubtitle", "Update this connection.")
          : t(
              "integrations.form.addSubtitle",
              "Store an API or MCP connection for the workspace.",
            )
      }
      footer={
        <div className="portal-integrations__modal-footer">
          <Button variant="ghost" size="sm" onClick={close}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button
            size="sm"
            onClick={() => void submit()}
            disabled={saving || !name.trim()}
          >
            {t("common.save", "Save")}
          </Button>
        </div>
      }
    >
      <div className="portal-integrations__form">
        {!isEdit && (
          <FormField label={t("integrations.form.type", "Type")}>
            <Select
              options={TYPE_OPTIONS}
              value={type}
              onChange={(e) => setType(e.target.value as FormType)}
            />
          </FormField>
        )}

        <FormField label={t("integrations.form.name", "Name")} required>
          <Input
            placeholder={t(
              "integrations.form.namePlaceholder",
              "A label you'll recognize",
            )}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </FormField>

        {!isEdit && (
          <FormField
            label={t("integrations.form.scope", "Who can use it")}
            helperText={scopeHint}
          >
            <Select
              options={SCOPE_OPTIONS.map((s) => ({
                value: s.value,
                label: s.label,
              }))}
              value={scope}
              onChange={(e) => setScope(e.target.value as FormScope)}
            />
          </FormField>
        )}

        {defs.map((f) => (
          <FormField key={f.key} label={f.label} required={f.required}>
            <Input
              type={f.secret ? "password" : "text"}
              placeholder={
                f.secret && isEdit
                  ? t(
                      "integrations.form.keepSecret",
                      "Leave blank to keep the saved value",
                    )
                  : f.placeholder
              }
              value={fields[f.key] ?? ""}
              onChange={(e) =>
                setFields((prev) => ({ ...prev, [f.key]: e.target.value }))
              }
            />
          </FormField>
        ))}

        <div className="portal-integrations__form-toggle">
          <ToggleSwitch
            checked={enabled}
            onChange={setEnabled}
            label={t("integrations.form.enabled", "Enabled")}
            description={t(
              "integrations.form.enabledHint",
              "Turn off to keep the config without letting anyone use it.",
            )}
          />
        </div>

        {error && (
          <p className="portal-integrations__form-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
