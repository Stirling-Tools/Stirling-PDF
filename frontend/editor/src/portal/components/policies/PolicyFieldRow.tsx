import { useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Chip, FormField, Input, Select, ToggleSwitch } from "@app/ui";
import type { PolicyField } from "@portal/api/policies";
import "@portal/views/Policies.css";

interface PolicyFieldRowProps {
  field: PolicyField;
  /** Effective current value (override or definition default). */
  value: boolean | string | string[];
  onChange: (value: boolean | string | string[]) => void;
}

/** Renders one `PolicyField`, dispatching on `type`. Controlled — the setup flow owns the
 *  value. */
export function PolicyFieldRow({
  field,
  value,
  onChange,
}: PolicyFieldRowProps) {
  const { t } = useTranslation();
  const helper = field.helper ? t(field.helper) : undefined;

  if (field.type === "toggle") {
    return (
      <div className="portal-policies__toggle-row">
        <ToggleSwitch
          checked={Boolean(value)}
          onChange={onChange}
          label={t(field.label)}
          description={helper}
        />
      </div>
    );
  }

  if (field.type === "tags") {
    return (
      <FormField label={t(field.label)} helperText={helper}>
        <PolicyTagsField
          value={Array.isArray(value) ? value : []}
          placeholder={field.placeholder ? t(field.placeholder) : undefined}
          onChange={onChange}
        />
      </FormField>
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
      <FormField label={t(field.label)} helperText={helper}>
        <div className="portal-policies__field-chips">
          {(field.options ?? []).map((opt) => (
            <Chip
              key={opt}
              accent={selected.includes(opt) ? "default" : "neutral"}
              size="sm"
              onClick={() => toggle(opt)}
            >
              {t(`policyOption.${opt}`, opt)}
            </Chip>
          ))}
        </div>
      </FormField>
    );
  }

  if (field.type === "select") {
    return (
      <FormField label={t(field.label)} helperText={helper}>
        <Select
          inputSize="sm"
          value={typeof value === "string" ? value : ""}
          options={(field.options ?? []).map((o) => ({
            value: o,
            label: t(`policyOption.${o}`, o),
          }))}
          onChange={(value) => onChange(value ?? "")}
        />
      </FormField>
    );
  }

  return (
    <FormField label={t(field.label)} helperText={helper}>
      <Input
        inputSize="sm"
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </FormField>
  );
}

/** Free-text multi-value entry (Enter or comma adds), for sets that can't be enumerated ahead of
 *  time — a team's own email domains, say. */
function PolicyTagsField({
  value,
  placeholder,
  onChange,
  id,
  "aria-describedby": describedBy,
}: {
  value: string[];
  placeholder?: string;
  onChange: (next: string[]) => void;
  /** FormField hands these to its child; they belong on the input the label points at. */
  id?: string;
  "aria-describedby"?: string;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");

  function commit() {
    const entry = draft.trim().replace(/^@/, "").toLowerCase();
    setDraft("");
    if (entry && !value.includes(entry)) onChange([...value, entry]);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      // Enter would otherwise submit the wizard, and a comma would land in the
      // value rather than separating two of them.
      event.preventDefault();
      commit();
    } else if (event.key === "Backspace" && !draft && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div className="portal-policies__tags">
      {value.length > 0 && (
        <div className="portal-policies__field-chips">
          {value.map((entry) => (
            <Chip
              key={entry}
              size="sm"
              removeLabel={t("common.remove", "Remove") + " " + entry}
              onRemove={() => onChange(value.filter((v) => v !== entry))}
            >
              {entry}
            </Chip>
          ))}
        </div>
      )}
      <Input
        id={id}
        aria-describedby={describedBy}
        inputSize="sm"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
      />
    </div>
  );
}
