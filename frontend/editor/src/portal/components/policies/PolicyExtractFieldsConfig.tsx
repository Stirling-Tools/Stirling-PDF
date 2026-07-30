import { useTranslation } from "react-i18next";
import { FormField, Input } from "@app/ui";

/** Configures the extract-fields step: the schema and optional guidance. */
export interface ExtractFieldsStepParams {
  fieldsSchema: string;
  mode: string;
  instructions: string;
}

interface PolicyExtractFieldsConfigProps {
  parameters: ExtractFieldsStepParams;
  onChange: (parameters: ExtractFieldsStepParams) => void;
}

export function PolicyExtractFieldsConfig({
  parameters,
  onChange,
}: PolicyExtractFieldsConfigProps) {
  const { t } = useTranslation();

  return (
    <div className="portal-policies__capability-config">
      <FormField
        label={t("portal.policies.config.extractFields.fields.schema")}
        helperText={t("portal.policies.config.extractFields.fields.schemaHelp")}
      >
        <textarea
          className="portal-sources__connection-textarea"
          rows={4}
          value={parameters.fieldsSchema ?? ""}
          placeholder='{"type": "object", "properties": {"invoice_number": {"type": "string"}}}'
          onChange={(e) =>
            onChange({ ...parameters, fieldsSchema: e.target.value })
          }
        />
      </FormField>
      <FormField
        label={t("portal.policies.config.extractFields.fields.instructions")}
        helperText={t(
          "portal.policies.config.extractFields.fields.instructionsHelp",
        )}
      >
        <Input
          inputSize="sm"
          value={parameters.instructions ?? ""}
          onChange={(e) =>
            onChange({ ...parameters, instructions: e.target.value })
          }
        />
      </FormField>
    </div>
  );
}
