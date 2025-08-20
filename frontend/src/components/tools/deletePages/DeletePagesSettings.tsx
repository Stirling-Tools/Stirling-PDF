import React from 'react';
import { Stack, Text, TextInput, Divider } from "@mantine/core";
import { useTranslation } from 'react-i18next';
import { DeletePagesParameters } from '../../../hooks/tools/deletePages/useDeletePagesParameters';

interface DeletePagesSettingsProps {
  parameters: DeletePagesParameters;
  onParameterChange: <K extends keyof DeletePagesParameters>(parameter: K, value: DeletePagesParameters[K]) => void;
  disabled?: boolean;
}

const DeletePagesSettings: React.FC<DeletePagesSettingsProps> = ({ 
  parameters, 
  onParameterChange, 
  disabled = false 
}) => {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      <Divider ml='-md' />
      <Stack gap="sm">
        <Text size="sm" fw={500}>
          {t('removePages.pageNumbers', 'Pages to Remove')}
        </Text>
        <TextInput
          value={parameters.pageNumbers}
          onChange={(e) => onParameterChange('pageNumbers', e.target.value.replace(/\s+/g, ''))}
          placeholder={t('removePages.pageNumbersPlaceholder', 'e.g. 1,3,5-7')}
          disabled={disabled}
          description={t('removePages.pageNumbersHelp', 'Enter page numbers separated by commas, or ranges like 1-5. Example: 1,3,5-7')}
        />
      </Stack>
    </Stack>
  );
};

export default DeletePagesSettings;