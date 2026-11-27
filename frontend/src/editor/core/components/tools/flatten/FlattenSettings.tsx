import { Stack, Checkbox, NumberInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { FlattenParameters } from "@editor/hooks/tools/flatten/useFlattenParameters";
import { infoLabelProps } from "@editor/components/tools/shared/infoLabel";

interface FlattenSettingsProps {
  parameters: FlattenParameters;
  onParameterChange: <K extends keyof FlattenParameters>(
    key: K,
    value: FlattenParameters[K],
  ) => void;
  disabled?: boolean;
}

const FlattenSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
}: FlattenSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      <Checkbox
        checked={parameters.flattenOnlyForms}
        onChange={(event) =>
          onParameterChange("flattenOnlyForms", event.currentTarget.checked)
        }
        disabled={disabled}
        {...infoLabelProps(
          t("flatten.options.flattenOnlyForms.label", "Flatten only forms"),
          t(
            "flatten.options.flattenOnlyForms.desc",
            "Only flatten form fields, leaving other interactive elements intact",
          ),
        )}
      />

      {!parameters.flattenOnlyForms && (
        <NumberInput
          {...infoLabelProps(
            t("flatten.renderDpi.label", "Rendering DPI"),
            t(
              "flatten.renderDpi.help",
              "Optional. Leave blank to use the system default; 150 DPI is recommended. Higher DPI sharpens output but increases processing time and file size.",
            ),
          )}
          placeholder={t("flatten.renderDpi.placeholder", "e.g. 150")}
          value={parameters.renderDpi ?? undefined}
          onChange={(value) =>
            onParameterChange(
              "renderDpi",
              value != null && value !== "" ? Number(value) : undefined,
            )
          }
          disabled={disabled}
          min={72}
          max={2400}
          step={50}
        />
      )}
    </Stack>
  );
};

export default FlattenSettings;
