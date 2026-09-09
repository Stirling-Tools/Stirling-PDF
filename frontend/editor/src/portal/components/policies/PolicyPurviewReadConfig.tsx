import { useTranslation } from "react-i18next";
import { FormField } from "@app/ui";
import { ConnectionPicker } from "@portal/components/sources/ConnectionPicker";

/**
 * Configures the "read a Purview label" step: which tenant to read against.
 *
 * This is the join-don't-beat primitive. Purview classifies documents; this reads the label it
 * applied so the rest of the policy can act on it - redact, watermark, route - which is the
 * PDF-specific work Purview does not do. Only the tenant matters here; the report the step emits
 * carries whatever label the document already holds.
 */
export interface PurviewReadParams {
  connectionId: string;
}

interface PolicyPurviewReadConfigProps {
  parameters: PurviewReadParams;
  onChange: (parameters: PurviewReadParams) => void;
}

export function PolicyPurviewReadConfig({
  parameters,
  onChange,
}: PolicyPurviewReadConfigProps) {
  const { t } = useTranslation();
  return (
    <div className="portal-policies__capability-config">
      <FormField
        label={t("portal.policies.config.purviewRead.fields.connection")}
        helperText={t(
          "portal.policies.config.purviewRead.fields.connectionHelp",
        )}
        required
      >
        <ConnectionPicker
          value={parameters.connectionId ?? ""}
          onChange={(id) => onChange({ ...parameters, connectionId: id })}
          integrationType="PURVIEW"
          createTypeId="purview"
        />
      </FormField>
    </div>
  );
}
