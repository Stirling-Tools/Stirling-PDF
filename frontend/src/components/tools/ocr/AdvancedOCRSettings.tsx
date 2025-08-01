import React from 'react';
import { Stack, Text, Checkbox } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { OCRParameters } from './OCRSettings';

export interface AdvancedOCRParameters {
  advancedOptions: string[];
}

interface AdvancedOption {
  value: string;
  label: string;
  isSpecial: boolean;
}

interface AdvancedOCRSettingsProps {
  advancedOptions: string[];
  ocrRenderType?: string;
  onParameterChange: (key: keyof OCRParameters, value: any) => void;
  disabled?: boolean;
}

const AdvancedOCRSettings: React.FC<AdvancedOCRSettingsProps> = ({
  advancedOptions,
  ocrRenderType = 'hocr',
  onParameterChange,
  disabled = false
}) => {
  const { t } = useTranslation();

  // Define the advanced options available
  const advancedOptionsData: AdvancedOption[] = [
    { value: 'compatibilityMode', label: t('ocr.settings.compatibilityMode.label', 'Compatibility Mode'), isSpecial: true },
    { value: 'sidecar', label: t('ocr.settings.advancedOptions.sidecar', 'Create a text file'), isSpecial: false },
    { value: 'deskew', label: t('ocr.settings.advancedOptions.deskew', 'Deskew pages'), isSpecial: false },
    { value: 'clean', label: t('ocr.settings.advancedOptions.clean', 'Clean input file'), isSpecial: false },
    { value: 'cleanFinal', label: t('ocr.settings.advancedOptions.cleanFinal', 'Clean final output'), isSpecial: false },
  ];

  // Handle individual checkbox changes
  const handleCheckboxChange = (optionValue: string, checked: boolean) => {
    const option = advancedOptionsData.find(opt => opt.value === optionValue);
    
    if (option?.isSpecial) {
      // Handle special options (like compatibility mode) differently
      if (optionValue === 'compatibilityMode') {
        onParameterChange('ocrRenderType', checked ? 'sandwich' : 'hocr');
      }
    } else {
      // Handle regular advanced options
      const newOptions = checked
        ? [...advancedOptions, optionValue]
        : advancedOptions.filter(option => option !== optionValue);
      onParameterChange('additionalOptions', newOptions);
    }
  };

  // Check if a special option is selected
  const isSpecialOptionSelected = (optionValue: string) => {
    if (optionValue === 'compatibilityMode') {
      return ocrRenderType === 'sandwich';
    }
    return false;
  };

  return (
    <Stack gap="md">
      <div>
        <Text size="sm" fw={500} mb="md">
          {t('ocr.settings.advancedOptions.label', 'Processing Options')}
        </Text>
        
        <Stack gap="sm">
          {advancedOptionsData.map((option) => (
            <Checkbox
              key={option.value}
              checked={option.isSpecial ? isSpecialOptionSelected(option.value) : advancedOptions.includes(option.value)}
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