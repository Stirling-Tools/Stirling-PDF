import { Stack, Divider, Text, NumberInput, Group, ColorInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { RedactParameters } from "../../../hooks/tools/redact/useRedactParameters";
import WordsToRedactInput from "./WordsToRedactInput";

interface AutomaticRedactSettingsProps {
  parameters: RedactParameters;
  onParameterChange: <K extends keyof RedactParameters>(key: K, value: RedactParameters[K]) => void;
  disabled?: boolean;
}

const AutomaticRedactSettings = ({ parameters, onParameterChange, disabled = false }: AutomaticRedactSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      <Divider ml='-md' />

      {/* Words to Redact */}
      <WordsToRedactInput
        wordsToRedact={parameters.wordsToRedact}
        onWordsChange={(words) => onParameterChange('wordsToRedact', words)}
        disabled={disabled}
      />

      <Divider />

      {/* Redaction Settings */}
      <Stack gap="sm">
        <Text size="sm" fw={500}>
          {t('redact.auto.settings', 'Redaction Settings')}
        </Text>

        {/* Box Color */}
        <Stack gap="sm">
          <Text size="sm">{t('redact.auto.colorLabel', 'Colour')}</Text>
          <Group gap="sm">
            <ColorInput
              value={parameters.redactColor}
              onChange={(value) => onParameterChange('redactColor', value)}
              disabled={disabled}
              size="sm"
              style={{ width: '80px' }}
            />
            <NumberInput
              value={parameters.customPadding}
              onChange={(value) => onParameterChange('customPadding', typeof value === 'number' ? value : 0.1)}
              min={0}
              max={10}
              step={0.1}
              disabled={disabled}
              size="sm"
              style={{ width: '80px' }}
              placeholder="0.1"
            />
          </Group>
        </Stack>

        {/* Use Regex */}
        <label
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <input
            type="checkbox"
            checked={parameters.useRegex}
            onChange={(e) => onParameterChange('useRegex', e.target.checked)}
            disabled={disabled}
          />
          <Text size="sm">{t('redact.auto.useRegexLabel', 'Use Regex')}</Text>
        </label>

        {/* Whole Word Search */}
        <label
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <input
            type="checkbox"
            checked={parameters.wholeWordSearch}
            onChange={(e) => onParameterChange('wholeWordSearch', e.target.checked)}
            disabled={disabled}
          />
          <Text size="sm">{t('redact.auto.wholeWordSearchLabel', 'Whole Word Search')}</Text>
        </label>

        {/* Convert PDF to PDF-Image */}
        <label
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
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
