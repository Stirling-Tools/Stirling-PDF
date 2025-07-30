import React from 'react';
import { Stack, Text, Divider, Switch, Group, Checkbox } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { OCRParameters } from './OCRSettings';

export interface AdvancedOCRParameters {
  ocrRenderType: string;
  advancedOptions: string[];
}

interface AdvancedOCRSettingsProps {
  ocrRenderType: string;
  advancedOptions: string[];
  onParameterChange: (key: keyof OCRParameters, value: any) => void;
  disabled?: boolean;
}

const AdvancedOCRSettings: React.FC<AdvancedOCRSettingsProps> = ({
  ocrRenderType,
  advancedOptions,
  onParameterChange,
  disabled = false
}) => {
  const { t } = useTranslation();

  // Define the advanced options available
  const advancedOptionsData = [
    { value: 'sidecar', label: t('ocr.settings.advancedOptions.sidecar', 'Create a text file') },
    { value: 'deskew', label: t('ocr.settings.advancedOptions.deskew', 'Deskew pages') },
    { value: 'clean', label: t('ocr.settings.advancedOptions.clean', 'Clean input file') },
    { value: 'cleanFinal', label: t('ocr.settings.advancedOptions.cleanFinal', 'Clean final output') },
  ];

  // Handle individual checkbox changes
  const handleCheckboxChange = (optionValue: string, checked: boolean) => {
    const newOptions = checked
      ? [...advancedOptions, optionValue]
      : advancedOptions.filter(option => option !== optionValue);
    onParameterChange('additionalOptions', newOptions);
  };

  return (
    <Stack gap="md">
        
      <div>
        <Text size="sm" fw={500} mb="sm" mt="md">
          {t('ocr.settings.output.label', 'Output Render Type ')}
        </Text>
        <Group justify="space-between" align="center" gap="xs" wrap="nowrap">
          <Text size="xs" style={{ flex: '0 1 auto', lineHeight: 1.3, textAlign: 'left' }}>
            {t('ocr.settings.output.hocr', 'HOCR (Auto)')}
          </Text>
          <Switch
            checked={ocrRenderType === 'sandwich'}
            onChange={(event) => onParameterChange('ocrRenderType', event.currentTarget.checked ? 'sandwich' : 'hocr')}
            disabled={disabled}
            size="sm"
            style={{ flexShrink: 0 }}
          />
          <Text size="xs" style={{ flex: '0 1 auto', lineHeight: 1.3, textAlign: 'right' }}>
            {t('ocr.settings.output.sandwich', 'Searchable PDF')}
          </Text>
        </Group>
      </div>

      <Divider />

      <div>
        <Text size="sm" fw={500} mb="md">
          {t('ocr.settings.advancedOptions.label', 'Processing Options')}
        </Text>
        <Stack gap="sm">
          {advancedOptionsData.map((option) => (
            <Checkbox
              key={option.value}
              checked={advancedOptions.includes(option.value)}
              onChange={(event) => handleCheckboxChange(option.value, event.currentTarget.checked)}
              label={option.label}
              disabled={disabled}
              size="sm"
            />
          ))}
        </Stack>
      </div>
    </Stack>
  );
};

export default AdvancedOCRSettings; 