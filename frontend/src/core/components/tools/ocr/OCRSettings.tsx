import React from 'react';
import { Stack, Select, Divider } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import LanguagePicker from '@app/components/tools/ocr/LanguagePicker';
import { OCRParameters } from '@app/hooks/tools/ocr/useOCRParameters';
import { Z_INDEX_AUTOMATE_DROPDOWN } from '@app/styles/zIndex';

interface OCRSettingsProps {
  parameters: OCRParameters;
  onParameterChange: <K extends keyof OCRParameters>(key: K, value: OCRParameters[K]) => void;
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
        comboboxProps={{ withinPortal: true, zIndex: Z_INDEX_AUTOMATE_DROPDOWN }}
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
