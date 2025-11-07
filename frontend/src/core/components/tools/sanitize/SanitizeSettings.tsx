import { Stack, Text, Checkbox } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { SanitizeParameters, defaultParameters } from "@app/hooks/tools/sanitize/useSanitizeParameters";

interface SanitizeSettingsProps {
  parameters: SanitizeParameters;
  onParameterChange: <K extends keyof SanitizeParameters>(key: K, value: SanitizeParameters[K]) => void;
  disabled?: boolean;
}

const SanitizeSettings = ({ parameters, onParameterChange, disabled = false }: SanitizeSettingsProps) => {
  const { t } = useTranslation();

  const options = (Object.keys(defaultParameters) as Array<keyof SanitizeParameters>).map((key) => ({
    key,
    label: t(`sanitize.options.${key}.label`, key),
    description: t(`sanitize.options.${key}.desc`, `${key} from the PDF`),
    default: defaultParameters[key],
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
