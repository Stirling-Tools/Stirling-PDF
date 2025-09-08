import { Stack, Text, NumberInput, ColorInput } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { RedactParameters } from '../../../hooks/tools/redact/useRedactParameters';

interface RedactAdvancedStepProps {
  parameters: RedactParameters;
  onParameterChange: <K extends keyof RedactParameters>(key: K, value: RedactParameters[K]) => void;
  disabled?: boolean;
}

export default function RedactAdvancedStep({ parameters, onParameterChange, disabled }: RedactAdvancedStepProps) {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      {/* Box Color */}
      <Stack gap="sm">
        <Text size="sm" fw={500}>{t('redact.advanced.colorLabel', 'Box Color')}</Text>
        <ColorInput
          value={parameters.redactColor}
          onChange={(value) => onParameterChange('redactColor', value)}
          disabled={disabled}
          size="sm"
        />
      </Stack>

      {/* Box Padding */}
      <Stack gap="sm">
        <Text size="sm" fw={500}>{t('redact.advanced.paddingLabel', 'Box Padding')}</Text>
        <NumberInput
          value={parameters.customPadding}
          onChange={(value) => onParameterChange('customPadding', typeof value === 'number' ? value : 0.1)}
          min={0}
          max={10}
          step={0.1}
          disabled={disabled}
          size="sm"
          placeholder="0.1"
        />
      </Stack>

      {/* Use Regex */}
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={parameters.useRegex}
          onChange={(e) => onParameterChange('useRegex', e.target.checked)}
          disabled={disabled}
        />
        <Text size="sm">{t('redact.advanced.useRegexLabel', 'Use Regex')}</Text>
      </label>

      {/* Whole Word Search */}
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={parameters.wholeWordSearch}
          onChange={(e) => onParameterChange('wholeWordSearch', e.target.checked)}
          disabled={disabled}
        />
        <Text size="sm">{t('redact.advanced.wholeWordSearchLabel', 'Whole Word Search')}</Text>
      </label>

      {/* Convert PDF to PDF-Image */}
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={parameters.convertPDFToImage}
          onChange={(e) => onParameterChange('convertPDFToImage', e.target.checked)}
          disabled={disabled}
        />
        <Text size="sm">{t('redact.advanced.convertPDFToImageLabel', 'Convert PDF to PDF-Image (Used to remove text behind the box)')}</Text>
      </label>
    </Stack>
  );
}
