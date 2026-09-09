import { useTranslation } from "react-i18next";
import { FormField, Input, Select } from "@app/ui";
import { ConnectionPicker } from "@portal/components/sources/ConnectionPicker";

/**
 * Configures the Purview labelling step: which tenant, and which label.
 *
 * The label is entered as its GUID. Listing labels by name needs Graph and an app registration,
 * which a connection may not have — so the GUID is the honest lowest common denominator, and the
 * name is optional metadata written alongside it (Microsoft stopped writing friendly names, but a
 * label carrying one is still easier to recognise downstream).
 */
export interface PurviewLabelParams {
  connectionId: string;
  labelId: string;
  labelName: string;
  method: string;
}

interface PolicyPurviewConfigProps {
  parameters: PurviewLabelParams;
  onChange: (parameters: PurviewLabelParams) => void;
}

export function PolicyPurviewConfig({
  parameters,
  onChange,
}: PolicyPurviewConfigProps) {
  const { t } = useTranslation();
  const set = (key: keyof PurviewLabelParams, value: string) =>
    onChange({ ...parameters, [key]: value });

  return (
    <div className="portal-policies__capability-config">
      <FormField
        label={t("portal.policies.config.purview.fields.connection")}
        required
      >
        <ConnectionPicker
          value={parameters.connectionId ?? ""}
          onChange={(id) => set("connectionId", id)}
          integrationType="PURVIEW"
          createTypeId="purview"
        />
      </FormField>

      <FormField
        label={t("portal.policies.config.purview.fields.labelId")}
        helperText={t("portal.policies.config.purview.fields.labelIdHelp")}
        required
      >
        <Input
          value={parameters.labelId ?? ""}
          placeholder="2096f6a2-d2f7-48be-b329-b73aaa526e5d"
          onChange={(e) => set("labelId", e.target.value)}
        />
      </FormField>

      <FormField
        label={t("portal.policies.config.purview.fields.labelName")}
        helperText={t("portal.policies.config.purview.fields.labelNameHelp")}
      >
        <Input
          value={parameters.labelName ?? ""}
          placeholder="Confidential"
          onChange={(e) => set("labelName", e.target.value)}
        />
      </FormField>

      <FormField
        label={t("portal.policies.config.purview.fields.method.label")}
        helperText={t("portal.policies.config.purview.fields.method.help")}
      >
        <Select
          value={parameters.method || "STANDARD"}
          options={[
            {
              value: "STANDARD",
              label: t("portal.policies.config.purview.fields.method.standard"),
            },
            {
              value: "PRIVILEGED",
              label: t(
                "portal.policies.config.purview.fields.method.privileged",
              ),
            },
          ]}
          onChange={(value) => set("method", value ?? "STANDARD")}
        />
      </FormField>
    </div>
  );
}
