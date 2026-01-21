import { Stack, NumberInput, ColorInput, Checkbox } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { RedactParameters } from "@app/hooks/tools/redact/useRedactParameters";
import { Z_INDEX_AUTOMATE_DROPDOWN } from "@app/styles/zIndex";

interface RedactAdvancedSettingsProps {
  parameters: RedactParameters;
  onParameterChange: <K extends keyof RedactParameters>(key: K, value: RedactParameters[K]) => void;
  disabled?: boolean;
}

const RedactAdvancedSettings = ({ parameters, onParameterChange, disabled = false }: RedactAdvancedSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      {/* Box Color */}
      <ColorInput
        label={t('redact.auto.colorLabel', 'Box Colour')}
        value={parameters.redactColor}
        onChange={(value) => onParameterChange('redactColor', value)}
        disabled={disabled}
        size="sm"
        format="hex"
        popoverProps={{ withinPortal: true, zIndex: Z_INDEX_AUTOMATE_DROPDOWN }}
      />

      {/* Box Padding */}
      <NumberInput
        label={t('redact.auto.customPaddingLabel', 'Custom Extra Padding')}
        value={parameters.customPadding}
        onChange={(value) => onParameterChange('customPadding', typeof value === 'number' ? value : 0.1)}
        min={0}
        max={10}
        step={0.1}
        disabled={disabled}
        size="sm"
        placeholder="0.1"
      />

      {/* Use Regex */}
      <Checkbox
        label={t('redact.auto.useRegexLabel', 'Use Regex')}
        checked={parameters.useRegex}
        onChange={(e) => onParameterChange('useRegex', e.currentTarget.checked)}
        disabled={disabled}
        size="sm"
      />

      {/* Whole Word Search */}
      <Checkbox
        label={t('redact.auto.wholeWordSearchLabel', 'Whole Word Search')}
        checked={parameters.wholeWordSearch}
        onChange={(e) => onParameterChange('wholeWordSearch', e.currentTarget.checked)}
        disabled={disabled}
        size="sm"
      />

      {/* Convert PDF to PDF-Image */}
      <Checkbox
        label={t('redact.auto.convertPDFToImageLabel', 'Convert PDF to PDF-Image (Used to remove text behind the box)')}
        checked={parameters.convertPDFToImage}
        onChange={(e) => onParameterChange('convertPDFToImage', e.currentTarget.checked)}
        disabled={disabled}
        size="sm"
      />
    </Stack>
  );
};

export default RedactAdvancedSettings;
