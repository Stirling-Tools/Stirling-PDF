import { ToggleSwitch } from "@shared/components/ToggleSwitch";
import { Select } from "@shared/components/Select";
import { Input } from "@shared/components/Input";
import { Chip } from "@shared/components/Chip";
import { SettingsRow } from "@shared/components/SettingsRow";
import type { PolicyField } from "@app/types/policies";

interface PolicyFieldRowProps {
  field: PolicyField;
  /** Effective current value (override or definition default). */
  value: boolean | string | string[];
  onChange: (value: boolean | string | string[]) => void;
  /** First row in a group omits the top divider. */
  first?: boolean;
}

/**
 * Renders one policy setting: toggle, select, multi-select chips, or text.
 * Controlled — the parent owns the value. Uses SUI controls (ToggleSwitch /
 * Select / Input / Chip) so it matches the rest of the policy surface.
 */
export function PolicyFieldRow({
  field,
  value,
  onChange,
  first,
}: PolicyFieldRowProps) {
  if (field.type === "chips") {
    const selected = Array.isArray(value) ? value : [];
    const toggle = (opt: string) =>
      onChange(
        selected.includes(opt)
          ? selected.filter((o) => o !== opt)
          : [...selected, opt],
      );
    return (
      <div className="pol-field" data-first={first || undefined}>
        <div className="pol-field-chips-head">
          <span className="pol-field-label">{field.label}</span>
          <span className="pol-field-count">{selected.length} selected</span>
        </div>
        <div className="pol-field-chips">
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
      </div>
    );
  }

  const control =
    field.type === "toggle" ? (
      <ToggleSwitch
        size="sm"
        checked={Boolean(value)}
        onChange={(checked) => onChange(checked)}
      />
    ) : field.type === "select" ? (
      <Select
        inputSize="sm"
        options={(field.options ?? []).map((o) => ({ value: o, label: o }))}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        aria-label={field.label}
      />
    ) : (
      <Input
        inputSize="sm"
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        aria-label={field.label}
      />
    );

  return (
    <div className="pol-field" data-first={first || undefined}>
      <SettingsRow label={field.label} control={control} />
    </div>
  );
}
