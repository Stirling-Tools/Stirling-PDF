import { Stack, Text, Checkbox } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { SanitizeParameters } from "../../../hooks/tools/sanitize/useSanitizeParameters";

interface SanitizeSettingsProps {
  parameters: SanitizeParameters;
  onParameterChange: (key: keyof SanitizeParameters, value: boolean) => void;
  disabled?: boolean;
}

const SanitizeSettings = ({ parameters, onParameterChange, disabled = false }: SanitizeSettingsProps) => {
  const { t } = useTranslation();

  const options = [
    {
      key: 'removeJavaScript' as const,
      label: t('sanitize.options.removeJavaScript', 'Remove JavaScript'),
      description: t('sanitize.options.removeJavaScript.desc', 'Remove JavaScript actions and scripts from the PDF'),
      default: true,
    },
    {
      key: 'removeEmbeddedFiles' as const,
      label: t('sanitize.options.removeEmbeddedFiles', 'Remove Embedded Files'),
      description: t('sanitize.options.removeEmbeddedFiles.desc', 'Remove any files embedded within the PDF'),
      default: true,
    },
    {
      key: 'removeXMPMetadata' as const,
      label: t('sanitize.options.removeXMPMetadata', 'Remove XMP Metadata'),
      description: t('sanitize.options.removeXMPMetadata.desc', 'Remove XMP metadata from the PDF'),
      default: false,
    },
    {
      key: 'removeMetadata' as const,
      label: t('sanitize.options.removeMetadata', 'Remove Document Metadata'),
      description: t('sanitize.options.removeMetadata.desc', 'Remove document information metadata (title, author, etc.)'),
      default: false,
    },
    {
      key: 'removeLinks' as const,
      label: t('sanitize.options.removeLinks', 'Remove Links'),
      description: t('sanitize.options.removeLinks.desc', 'Remove external links and launch actions from the PDF'),
      default: false,
    },
    {
      key: 'removeFonts' as const,
      label: t('sanitize.options.removeFonts', 'Remove Fonts'),
      description: t('sanitize.options.removeFonts.desc', 'Remove embedded fonts from the PDF'),
      default: false,
    },
  ];

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
