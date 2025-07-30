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
    { value: 'sidecar', label: t('ocr.settings.additionalOptions.sidecar', 'Create sidecar text file') },
    { value: 'deskew', label: t('ocr.settings.additionalOptions.deskew', 'Deskew pages') },
    { value: 'clean', label: t('ocr.settings.additionalOptions.clean', 'Clean input file') },
    { value: 'cleanFinal', label: t('ocr.settings.additionalOptions.cleanFinal', 'Clean final output') },
  ];

  return (
    <Stack gap="md">
      <Text size="sm" fw={500}>{t('ocr.settings.title', 'OCR Configuration')}</Text>

      <Select
        label={t('ocr.settings.ocrMode.label', 'OCR Mode')}
        value={parameters.ocrType}
        onChange={(value) => onParameterChange('ocrType', value || 'skip-text')}
        data={[
          { value: 'skip-text', label: t('ocr.settings.ocrMode.auto', 'Auto (skip text layers)') },
          { value: 'force-ocr', label: t('ocr.settings.ocrMode.force', 'Force (re-OCR all, replace text)') },
          { value: 'Normal', label: t('ocr.settings.ocrMode.strict', 'Strict (abort if text found)') },
        ]}
        disabled={disabled}
      />

      <Divider />

      <LanguagePicker
        value={parameters.languages[0] || ''}
        onChange={(value) => onParameterChange('languages', [value])}
        placeholder={t('ocr.settings.languages.placeholder', 'Select primary language for OCR')}
        disabled={disabled}
        label={t('ocr.settings.languages.label', 'Languages')}
      />

      <Divider />

      <Select
        label={t('ocr.settings.output.label', 'Output')}
        value={parameters.ocrRenderType}
        onChange={(value) => onParameterChange('ocrRenderType', value || 'sandwich')}
        data={[
          { value: 'sandwich', label: t('ocr.settings.output.sandwich', 'Searchable PDF (Sandwich)') },
          { value: 'hocr', label: t('ocr.settings.output.hocr', 'HOCR XML') }
        ]}
        disabled={disabled}
      />

      <Divider />

      <MultiSelect
        label={t('ocr.settings.additionalOptions.label', 'Additional Options')}
        placeholder={t('ocr.settings.additionalOptions.placeholder', 'Select Options')}
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