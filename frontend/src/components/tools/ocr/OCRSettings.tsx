import React from 'react';
import { Stack, Select, Text, Divider } from '@mantine/core';
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

  return (
    <Stack gap="md">
      
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
        value={parameters.languages || []}
        onChange={(value) => onParameterChange('languages', value)}
        placeholder={t('ocr.settings.languages.placeholder', 'Select languages')}
        disabled={disabled}
        label={t('ocr.settings.languages.label', 'Languages')}
      />
    </Stack>
  );
};

export default OCRSettings; 