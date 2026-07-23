import { useTranslation } from "react-i18next";
import { FormField, Input, Select } from "@app/ui";
import {
  isFieldVisible,
  type ConnectionFieldDef,
  type CreatableConnectionType,
} from "@portal/components/sources/connectionTypes";

/**
 * Renders whatever fields a connection type declares, rather than knowing any vendor's shape.
 *
 * Mirrors how {@code SourceBuilder} renders {@code CREATABLE_SOURCE_TYPES}: adding Purview or
 * ConsignO is a descriptor, not a component. Secrets are write-only — on edit the backend returns
 * them masked and keeps the stored value when the mask is sent back untouched.
 */
interface ConnectionFormProps {
  type: CreatableConnectionType;
  /** Answers keyed by field key, plus `name`. Dotted keys nest at build time. */
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
}

export function ConnectionForm({
  type,
  values,
  onChange,
}: ConnectionFormProps) {
  const { t } = useTranslation();
  const set = (key: string, value: string) =>
    onChange({ ...values, [key]: value });

  return (
    <div className="portal-sources__connection-form">
      {/* "S3 storage name", "Jira name": the vendor is in the label, so the
          field explains itself and the placeholder stays a neutral example. */}
      <FormField
        label={t("portal.integrations.typedName", {
          tool: t(type.labelKey),
        })}
        required
      >
        <Input
          value={values.name ?? ""}
          placeholder={t("portal.connections.fields.namePlaceholder")}
          onChange={(e) => set("name", e.target.value)}
        />
      </FormField>

      {type.fields
        // A hidden field keeps its value in state so switching auth type and back does not
        // silently discard what was typed; buildConnectionConfig sends only what is filled.
        .filter((field) => isFieldVisible(field, values))
        .map((field) => (
          <ConnectionField
            key={field.key}
            field={field}
            value={values[field.key] ?? ""}
            onChange={(value) => set(field.key, value)}
          />
        ))}
    </div>
  );
}

function ConnectionField({
  field,
  value,
  onChange,
}: {
  field: ConnectionFieldDef;
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <FormField
      label={t(field.labelKey)}
      required={field.required}
      helperText={field.helperTextKey ? t(field.helperTextKey) : undefined}
    >
      {field.control === "select" ? (
        <Select
          value={value}
          options={(field.options ?? []).map((option) => ({
            value: option.value,
            label: t(option.labelKey),
          }))}
          onChange={(next) => onChange(next ?? "")}
        />
      ) : field.control === "textarea" || field.control === "hostList" ? (
        <textarea
          className="portal-sources__connection-textarea"
          rows={field.control === "hostList" ? 2 : 5}
          value={value}
          placeholder={
            field.placeholderKey ? t(field.placeholderKey) : undefined
          }
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Input
          type={field.control === "password" ? "password" : undefined}
          value={value}
          placeholder={
            field.placeholderKey ? t(field.placeholderKey) : undefined
          }
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </FormField>
  );
}
