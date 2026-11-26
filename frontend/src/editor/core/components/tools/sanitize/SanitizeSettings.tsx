import { Stack, Text, Checkbox } from "@mantine/core";
import { useTranslation } from "react-i18next";
import {
  SanitizeParameters,
  defaultParameters,
  validateSanitizeParameters,
} from "@editor/hooks/tools/sanitize/useSanitizeParameters";
import { infoLabelProps } from "@editor/components/tools/shared/infoLabel";

interface SanitizeSettingsProps {
  parameters: SanitizeParameters;
  onParameterChange: <K extends keyof SanitizeParameters>(
    key: K,
    value: SanitizeParameters[K],
  ) => void;
  disabled?: boolean;
}

const SanitizeSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
}: SanitizeSettingsProps) => {
  const { t } = useTranslation();

  const options = (
    Object.keys(defaultParameters) as Array<keyof SanitizeParameters>
  ).map((key) => ({
    key,
    label: t(`sanitize.options.${key}.label`, key),
    description: t(`sanitize.options.${key}.desc`, `${key} from the PDF`),
  }));

  return (
    <Stack gap="sm">
      {options.map((option) => (
        <Checkbox
          key={option.key}
          checked={parameters[option.key]}
          onChange={(event) =>
            onParameterChange(option.key, event.currentTarget.checked)
          }
          disabled={disabled}
          {...infoLabelProps(option.label, option.description)}
        />
      ))}

      {!validateSanitizeParameters(parameters) && (
        <Text role="alert" size="sm" c="var(--c-warning-text)">
          {t(
            "sanitize.options.noneSelected",
            "Select at least one element to remove.",
          )}
        </Text>
      )}
    </Stack>
  );
};

export default SanitizeSettings;
