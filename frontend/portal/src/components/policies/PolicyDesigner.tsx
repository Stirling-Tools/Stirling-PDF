import { useEffect, useState } from "react";
import {
  Button,
  FormField,
  Input,
  Modal,
  Select,
  ToggleSwitch,
} from "@shared/components";
import {
  POLICY_CATEGORY_META,
  type PolicyCategoryConfig,
  type PolicyField,
  type PolicyOverride,
} from "@portal/api/policies";
import { OverridesTable } from "@portal/components/policies/OverridesTable";
import "@portal/views/Policies.css";

interface PolicyDesignerProps {
  /** The category being edited, or null when the modal is closed. */
  config: PolicyCategoryConfig | null;
  onClose: () => void;
}

/**
 * Edit one category's global default config plus its per-document-type
 * overrides. Form state is local — submitting is a demo stub until the backend
 * exists. Field controls are picked generically by `field.kind`, so the five
 * categories share this one editor.
 */
export function PolicyDesigner({ config, onClose }: PolicyDesignerProps) {
  const [fields, setFields] = useState<PolicyField[]>([]);
  const [overrides, setOverrides] = useState<PolicyOverride[]>([]);

  // Reseed local form state whenever a different category is opened.
  useEffect(() => {
    if (config) {
      setFields(config.fields.map((f) => ({ ...f })));
      setOverrides(config.overrides.map((o) => ({ ...o })));
    }
  }, [config]);

  if (!config) return null;

  const meta = POLICY_CATEGORY_META[config.category];

  function setFieldValue(key: string, value: string | number | boolean) {
    setFields((prev) => prev.map((f) => (f.key === key ? { ...f, value } : f)));
  }

  function save() {
    // TODO(backend): PUT /v1/policies/{category} { fields, overrides } — persist
    // the global default and overrides, then close on success.
    onClose();
  }

  return (
    <Modal
      open={config !== null}
      onClose={onClose}
      width="lg"
      title={`${meta.label} policy`}
      subtitle={meta.blurb}
      footer={
        <div className="portal-policies__designer-foot">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={save}>
            Save policy
          </Button>
        </div>
      }
    >
      <h3 className="portal-policies__designer-heading">Global default</h3>
      <div className="portal-policies__fields">
        {fields.map((field) => (
          <PolicyFieldControl
            key={field.key}
            field={field}
            onChange={(value) => setFieldValue(field.key, value)}
          />
        ))}
      </div>

      <h3 className="portal-policies__designer-heading">
        Per-document-type overrides
      </h3>
      <OverridesTable overrides={overrides} onChange={setOverrides} />
    </Modal>
  );
}

interface PolicyFieldControlProps {
  field: PolicyField;
  onChange: (value: string | number | boolean) => void;
}

/** Maps a single typed policy field to its SUI control. */
function PolicyFieldControl({ field, onChange }: PolicyFieldControlProps) {
  if (field.kind === "toggle") {
    return (
      <div className="portal-policies__toggle-row">
        <ToggleSwitch
          checked={Boolean(field.value)}
          onChange={onChange}
          label={field.label}
          description={field.help}
        />
      </div>
    );
  }

  if (field.kind === "select") {
    return (
      <FormField label={field.label} helperText={field.help}>
        <Select
          inputSize="sm"
          value={String(field.value)}
          options={field.options ?? []}
          onChange={(e) => onChange(e.target.value)}
        />
      </FormField>
    );
  }

  if (field.kind === "number") {
    return (
      <FormField label={field.label} helperText={field.help}>
        <Input
          inputSize="sm"
          type="number"
          value={String(field.value)}
          trailingIcon={
            field.unit ? <span aria-hidden>{field.unit}</span> : undefined
          }
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </FormField>
    );
  }

  return (
    <FormField label={field.label} helperText={field.help}>
      <Input
        inputSize="sm"
        value={String(field.value)}
        onChange={(e) => onChange(e.target.value)}
      />
    </FormField>
  );
}
