import { Switch, Select, TextInput } from "@mantine/core";
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
 * Controlled — the parent owns the value.
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
            <button
              key={opt}
              type="button"
              className={`pol-chip${selected.includes(opt) ? " is-on" : ""}`}
              onClick={() => toggle(opt)}
              aria-pressed={selected.includes(opt)}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="pol-field pol-field-row" data-first={first || undefined}>
      <span className="pol-field-label">{field.label}</span>
      {field.type === "toggle" ? (
        <Switch
          size="sm"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.currentTarget.checked)}
          aria-label={field.label}
        />
      ) : field.type === "select" ? (
        <Select
          size="xs"
          data={field.options ?? []}
          value={typeof value === "string" ? value : ""}
          onChange={(v) => onChange(v ?? "")}
          allowDeselect={false}
          comboboxProps={{ withinPortal: true }}
          styles={{ root: { width: 150 } }}
          aria-label={field.label}
        />
      ) : (
        <TextInput
          size="xs"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.currentTarget.value)}
          styles={{ root: { width: 160 } }}
          aria-label={field.label}
        />
      )}
    </div>
  );
}
