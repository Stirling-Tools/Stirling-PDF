import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  // Field labels and option labels come from the policy catalog data, so they're
  // wrapped at the render site with data-keyed ids (English stays the fallback).
  const fieldLabel = t(`policies.field.${field.key}`, field.label);

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
          <span className="pol-field-label">{fieldLabel}</span>
          <span className="pol-field-count">
            {t("policies.fields.selectedCount", "{{count}} selected", {
              count: selected.length,
            })}
          </span>
        </div>
        <div className="pol-field-chips">
          {(field.options ?? []).map((opt) => (
            <Chip
              key={opt}
              tone={selected.includes(opt) ? "blue" : "neutral"}
              size="sm"
              onClick={() => toggle(opt)}
            >
              {t(`policies.fieldOption.${field.key}.${opt}`, opt)}
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
        aria-label={fieldLabel}
      />
    ) : field.type === "select" ? (
      <Select
        inputSize="sm"
        options={(field.options ?? []).map((o) => ({
          value: o,
          label: t(`policies.fieldOption.${field.key}.${o}`, o),
        }))}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        aria-label={fieldLabel}
      />
    ) : (
      <Input
        inputSize="sm"
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        aria-label={fieldLabel}
      />
    );

  return (
    <div className="pol-field" data-first={first || undefined}>
      <SettingsRow label={fieldLabel} control={control} />
    </div>
  );
}
