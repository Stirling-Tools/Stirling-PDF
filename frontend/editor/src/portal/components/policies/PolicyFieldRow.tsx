import {
  Chip,
  FormField,
  Input,
  Select,
  ToggleSwitch,
} from "@shared/components";
import type { PolicyField } from "@portal/api/policies";
import "@portal/views/Policies.css";

interface PolicyFieldRowProps {
  field: PolicyField;
  /** Effective current value (override or definition default). */
  value: boolean | string | string[];
  onChange: (value: boolean | string | string[]) => void;
}

/**
 * Renders one policy setting from the catalogue's `PolicyField`, dispatching on
 * `type`: toggle → ToggleSwitch, select → Select, chips → multi-select Chips,
 * text → Input. Controlled — the setup flow owns the value.
 */
export function PolicyFieldRow({
  field,
  value,
  onChange,
}: PolicyFieldRowProps) {
  if (field.type === "toggle") {
    return (
      <div className="portal-policies__toggle-row">
        <ToggleSwitch
          checked={Boolean(value)}
          onChange={onChange}
          label={field.label}
        />
      </div>
    );
  }

  if (field.type === "chips") {
    const selected = Array.isArray(value) ? value : [];
    const toggle = (opt: string) =>
      onChange(
        selected.includes(opt)
          ? selected.filter((o) => o !== opt)
          : [...selected, opt],
      );
    return (
      <FormField label={field.label}>
        <div className="portal-policies__field-chips">
          {(field.options ?? []).map((opt) => (
            <Chip
              key={opt}
              tone={selected.includes(opt) ? "blue" : "neutral"}
              size="sm"
              onClick={() => toggle(opt)}
            >
              {opt}
            </Chip>
          ))}
        </div>
      </FormField>
    );
  }

  if (field.type === "select") {
    return (
      <FormField label={field.label}>
        <Select
          inputSize="sm"
          value={typeof value === "string" ? value : ""}
          options={(field.options ?? []).map((o) => ({ value: o, label: o }))}
          onChange={(e) => onChange(e.target.value)}
        />
      </FormField>
    );
  }

  return (
    <FormField label={field.label}>
      <Input
        inputSize="sm"
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </FormField>
  );
}
