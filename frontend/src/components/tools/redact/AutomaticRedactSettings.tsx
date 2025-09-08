import { Stack, Text, Textarea, Select, NumberInput, Divider } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { RedactParameters } from "../../../hooks/tools/redact/useRedactParameters";

interface AutomaticRedactSettingsProps {
  parameters: RedactParameters;
  onParameterChange: <K extends keyof RedactParameters>(key: K, value: RedactParameters[K]) => void;
  disabled?: boolean;
}

const AutomaticRedactSettings = ({ parameters, onParameterChange, disabled = false }: AutomaticRedactSettingsProps) => {
  const { t } = useTranslation();

  const colorOptions = [
    { value: '#000000', label: t('black', 'Black') },
    { value: '#FFFFFF', label: t('white', 'White') },
    { value: '#FF0000', label: t('red', 'Red') },
    { value: '#00FF00', label: t('green', 'Green') },
    { value: '#0000FF', label: t('blue', 'Blue') },
  ];

  return (
    <Stack gap="md">
      <Divider ml='-md' />

      {/* Text to Redact */}
      <Stack gap="sm">
        <Text size="sm" fw={500}>
          {t('redact.auto.textsToRedactLabel', 'Text to Redact (line-separated)')}
        </Text>
        <Textarea
          placeholder={t('redact.auto.textsToRedactPlaceholder', 'e.g. \nConfidential \nTop-Secret')}
          value={parameters.listOfText}
          onChange={(e) => onParameterChange('listOfText', e.target.value)}
          disabled={disabled}
          rows={4}
          required
        />
      </Stack>

      <Divider />

      {/* Redaction Color */}
      <Stack gap="sm">
        <Text size="sm" fw={500}>
          {t('redact.auto.colorLabel', 'Color')}
        </Text>
        <Select
          value={parameters.redactColor}
          onChange={(value) => {
            if (value) {
              onParameterChange('redactColor', value);
            }
          }}
          disabled={disabled}
          data={colorOptions}
        />
      </Stack>

      <Divider />

      {/* Search Options */}
      <Stack gap="sm">
        <Text size="sm" fw={500}>Search Options</Text>

        <label
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          title="Use regular expressions for pattern matching"
        >
          <input
            type="checkbox"
            checked={parameters.useRegex}
            onChange={(e) => onParameterChange('useRegex', e.target.checked)}
            disabled={disabled}
          />
          <Text size="sm">{t('redact.auto.useRegexLabel', 'Use Regex')}</Text>
        </label>

        <label
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          title="Match whole words only, not partial matches within words"
        >
          <input
            type="checkbox"
            checked={parameters.wholeWordSearch}
            onChange={(e) => onParameterChange('wholeWordSearch', e.target.checked)}
            disabled={disabled}
          />
          <Text size="sm">{t('redact.auto.wholeWordSearchLabel', 'Whole Word Search')}</Text>
        </label>
      </Stack>

      <Divider />

      {/* Advanced Options */}
      <Stack gap="sm">
        <Text size="sm" fw={500}>Advanced Options</Text>

        <Stack gap="sm">
          <Text size="sm">{t('redact.auto.customPaddingLabel', 'Custom Extra Padding')}</Text>
          <NumberInput
            value={parameters.customPadding}
            onChange={(value) => onParameterChange('customPadding', typeof value === 'number' ? value : 0.1)}
            min={0}
            max={10}
            step={0.1}
            disabled={disabled}
            placeholder="0.1"
          />
        </Stack>

        <label
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          title="Convert PDF to PDF-Image to remove text behind the redaction box"
        >
          <input
            type="checkbox"
            checked={parameters.convertPDFToImage}
            onChange={(e) => onParameterChange('convertPDFToImage', e.target.checked)}
            disabled={disabled}
          />
          <Text size="sm">{t('redact.auto.convertPDFToImageLabel', 'Convert PDF to PDF-Image (Used to remove text behind the box)')}</Text>
        </label>
      </Stack>
    </Stack>
  );
};

export default AutomaticRedactSettings;
