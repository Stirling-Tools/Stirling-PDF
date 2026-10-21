import { useTranslation } from "react-i18next";
import { FormField, Select } from "@app/ui";

interface Props {
  external: boolean;
  requiresDestination: boolean;
  onChange: (external: boolean) => void;
}

/** Editor delivery must be explicit before choosing a saved destination. */
export function EditorDeliverySelect({
  external,
  requiresDestination,
  onChange,
}: Props) {
  const { t } = useTranslation();
  return (
    <FormField
      label={t("portal.policies.wizard.locations.delivery", "Delivery")}
      helperText={
        external
          ? t(
              "portal.policies.wizard.locations.keepOriginalHelp",
              "A copy runs in the background. Your editor files stay unchanged; results are saved to the destination below.",
            )
          : t(
              "portal.policies.wizard.locations.editorOutput",
              "Processed PDFs return to the editor workspace.",
            )
      }
    >
      <Select
        inputSize="sm"
        value={external ? "destination" : "workspace"}
        onChange={(value) => value && onChange(value === "destination")}
        options={[
          ...(!requiresDestination
            ? [
                {
                  value: "workspace",
                  label: t(
                    "portal.policies.wizard.locations.returnToEditor",
                    "Return results to editor",
                  ),
                },
              ]
            : []),
          {
            value: "destination",
            label: t(
              "portal.policies.wizard.locations.keepOriginal",
              "Keep originals and send to a destination",
            ),
          },
        ]}
      />
    </FormField>
  );
}
