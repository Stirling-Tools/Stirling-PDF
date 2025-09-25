import { useTranslation } from 'react-i18next';
import { Stack, Select, Checkbox } from '@mantine/core';
import { ExtractImagesParameters } from '../../../hooks/tools/extractImages/useExtractImagesParameters';

interface ExtractImagesSettingsProps {
  parameters: ExtractImagesParameters;
  onParameterChange: <K extends keyof ExtractImagesParameters>(key: K, value: ExtractImagesParameters[K]) => void;
  disabled?: boolean;
}

const ExtractImagesSettings = ({
  parameters,
  onParameterChange,
  disabled = false
}: ExtractImagesSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      <Select
        label={t('extractImages.selectText', 'Output Format')}
        value={parameters.format}
        onChange={(value) => {
          const allowedFormats = ['png', 'jpg', 'gif'] as const;
          const format = allowedFormats.includes(value as any) ? (value as typeof allowedFormats[number]) : 'png';
          onParameterChange('format', format);
        }}
        data={[
          { value: 'png', label: 'PNG' },
          { value: 'jpg', label: 'JPG' },
          { value: 'gif', label: 'GIF' },
        ]}
        disabled={disabled}
      />

      <Checkbox
        label={t('extractImages.allowDuplicates', 'Allow Duplicate Images')}
        checked={parameters.allowDuplicates}
        onChange={(event) => onParameterChange('allowDuplicates', event.currentTarget.checked)}
        disabled={disabled}
      />
    </Stack>
  );
};

export default ExtractImagesSettings;