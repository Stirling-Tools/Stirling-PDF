import React from 'react';
import { Stack, Checkbox } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { MergeParameters } from '@app/hooks/tools/merge/useMergeParameters';

interface MergeSettingsProps {
  parameters: MergeParameters;
  onParameterChange: <K extends keyof MergeParameters>(key: K, value: MergeParameters[K]) => void;
  disabled?: boolean;
}

const MergeSettings: React.FC<MergeSettingsProps> = ({
  parameters,
  onParameterChange,
  disabled = false,
}) => {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      <Checkbox
        label={t('merge.removeDigitalSignature.label', 'Remove digital signature in the merged file?')}
        checked={parameters.removeDigitalSignature}
        onChange={(event) => onParameterChange('removeDigitalSignature', event.currentTarget.checked)}
        disabled={disabled}
      />

      <Checkbox
        label={t('merge.generateTableOfContents.label', 'Generate table of contents in the merged file?')}
        checked={parameters.generateTableOfContents}
        onChange={(event) => onParameterChange('generateTableOfContents', event.currentTarget.checked)}
        disabled={disabled}
      />
    </Stack>
  );
};

export default MergeSettings;
