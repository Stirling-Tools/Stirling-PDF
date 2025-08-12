import { Stack, Text, Checkbox } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { SanitizeParameters, defaultParameters } from "../../../hooks/tools/sanitize/useSanitizeParameters";

interface SanitizeSettingsProps {
  parameters: SanitizeParameters;
  onParameterChange: (key: keyof SanitizeParameters, value: boolean) => void;
  disabled?: boolean;
}

const SanitizeSettings = ({ parameters, onParameterChange, disabled = false }: SanitizeSettingsProps) => {
  const { t } = useTranslation();

  const options = Object.entries(defaultParameters).map(([key, value]) => ({
    key: key as keyof SanitizeParameters,
    label: t(`sanitize.options.${key}`, key),
    description: t(`sanitize.options.${key}.desc`, `${key} from the PDF`),
    default: value,
  }));

  return (
    <Stack gap="md">
      <Text size="sm" fw={500}>
        {t('sanitize.options.title', 'Sanitization Options')}
      </Text>

      <Stack gap="sm">
        {options.map((option) => (
          <Checkbox
            key={option.key}
            checked={parameters[option.key]}
            onChange={(event) => onParameterChange(option.key, event.currentTarget.checked)}
            disabled={disabled}
            label={
              <div>
                <Text size="sm">{option.label}</Text>
                <Text size="xs" c="dimmed">{option.description}</Text>
              </div>
            }
          />
        ))}
      </Stack>

      <Text size="xs" c="dimmed">
        {t('sanitize.options.note', 'Select the elements you want to remove from the PDF. At least one option must be selected.')}
      </Text>
    </Stack>
  );
};

export default SanitizeSettings;
