import React from 'react';
import { Stack, Select, MultiSelect, Text, Divider } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import LanguagePicker from './LanguagePicker';

export interface OCRParameters {
  languages: string[];
  ocrType: string;
  ocrRenderType: string;
  additionalOptions: string[];
}

interface OCRSettingsProps {
  parameters: OCRParameters;
  onParameterChange: (key: keyof OCRParameters, value: any) => void;
  disabled?: boolean;
}

const OCRSettings: React.FC<OCRSettingsProps> = ({
  parameters,
  onParameterChange,
  disabled = false
}) => {
  const { t } = useTranslation();

  // Define the additional options available
  const additionalOptionsData = [
    { value: 'sidecar', label: 'Create sidecar text file' },
    { value: 'deskew', label: 'Deskew pages' },
    { value: 'clean', label: 'Clean input file' },
    { value: 'cleanFinal', label: 'Clean final output' },
  ];

  return (
    <Stack gap="md">
      <Text size="sm" fw={500}>OCR Configuration</Text>

      <Select
        label="OCR Mode"
        value={parameters.ocrType}
        onChange={(value) => onParameterChange('ocrType', value || 'skip-text')}
        data={[
          { value: 'skip-text', label: 'Auto (skip text layers)' },
          { value: 'force-ocr', label: 'Force (re-OCR all, replace text)' },
          { value: 'Normal', label: 'Strict (abort if text found)' },
        ]}
        disabled={disabled}
      />

      <Divider />

      <LanguagePicker
        value={parameters.languages[0] || ''}
        onChange={(value) => onParameterChange('languages', [value])}
        placeholder="Select primary language for OCR"
        disabled={disabled}
        label="Languages"
      />

      <Divider />

      <Select
        label="Output"
        value={parameters.ocrRenderType}
        onChange={(value) => onParameterChange('ocrRenderType', value || 'hocr')}
        data={[
          { value: 'hocr', label: 'Searchable PDF (sandwich)' },
          { value: 'sandwich', label: 'Sandwich' },
        ]}
        disabled={disabled}
      />

      <Divider />

      <MultiSelect
        label="Additional Options"
        placeholder="Select Options"
        value={parameters.additionalOptions}
        onChange={(value) => onParameterChange('additionalOptions', value)}
        data={additionalOptionsData}
        disabled={disabled}
        clearable
        comboboxProps={{ position: 'top', middlewares: { flip: false, shift: false } }}

      />
    </Stack>
  );
};

export default OCRSettings; 