import React from 'react';
import { Stack, Select, Checkbox, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { MergeParameters } from '../../../hooks/tools/merge/useMergeParameters';

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

  const mergeOrderOptions = [
    { value: 'orderProvided', label: t('merge.orderBy.orderProvided', 'Dragging Files') },
    { value: 'byFileName', label: t('merge.orderBy.byFileName', 'By File Name') },
    { value: 'byDateModified', label: t('merge.orderBy.byDateModified', 'By Date Modified') },
    { value: 'byDateCreated', label: t('merge.orderBy.byDateCreated', 'By Date Created') },
    { value: 'byPDFTitle', label: t('merge.orderBy.byPDFTitle', 'By PDF Title') },
  ];

  return (
    <Stack gap="md">
      <div>
        <Text size="sm" fw={500} mb="xs">
          {t('merge.orderBy.title', 'Merge Order')}
        </Text>
        <Select
          data={mergeOrderOptions}
          value={parameters.mergeOrder}
          onChange={(value) => onParameterChange('mergeOrder', value as MergeParameters['mergeOrder'])}
          disabled={disabled}
          placeholder={t('merge.orderBy.placeholder', 'Select merge order')}
        />
      </div>

      <Checkbox
        label={t('merge.removeDigitalSignature', 'Remove digital signature in the merged file?')}
        checked={parameters.removeDigitalSignature}
        onChange={(event) => onParameterChange('removeDigitalSignature', event.currentTarget.checked)}
        disabled={disabled}
      />

      <Checkbox
        label={t('merge.generateTableOfContents', 'Generate table of contents in the merged file?')}
        checked={parameters.generateTableOfContents}
        onChange={(event) => onParameterChange('generateTableOfContents', event.currentTarget.checked)}
        disabled={disabled}
      />
    </Stack>
  );
};

export default MergeSettings;
