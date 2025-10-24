import React from 'react';
import { useTranslation } from 'react-i18next';
import { Stack, Text } from '@mantine/core';
import { SingleLargePageParameters } from '../../../hooks/tools/singleLargePage/useSingleLargePageParameters';
import ProcessingModeToggle from '../../shared/ProcessingModeToggle';

interface SingleLargePageSettingsProps {
  parameters: SingleLargePageParameters;
  onParameterChange: <K extends keyof SingleLargePageParameters>(parameter: K, value: SingleLargePageParameters[K]) => void;
  disabled?: boolean;
}

const SingleLargePageSettings: React.FC<SingleLargePageSettingsProps> = ({ parameters, onParameterChange, disabled = false }) => {
  const { t } = useTranslation();

  return (
    <Stack gap="sm">
      <ProcessingModeToggle
        value={parameters.processingMode}
        onChange={(mode) => onParameterChange('processingMode', mode)}
        disabled={disabled}
      />

      <Text size="sm" c="dimmed">
        {t('pdfToSinglePage.description', 'This tool will merge all pages of your PDF into one large single page. The width will remain the same as the original pages, but the height will be the sum of all page heights.')}
      </Text>
    </Stack>
  );
};

export default SingleLargePageSettings;
