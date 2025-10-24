import React from 'react';
import { useTranslation } from 'react-i18next';
import { SegmentedControl, Stack, Text } from '@mantine/core';
import { SingleLargePageParameters } from '../../../hooks/tools/singleLargePage/useSingleLargePageParameters';

interface SingleLargePageSettingsProps {
  parameters: SingleLargePageParameters;
  onParameterChange: <K extends keyof SingleLargePageParameters>(parameter: K, value: SingleLargePageParameters[K]) => void;
  disabled?: boolean;
}

const SingleLargePageSettings: React.FC<SingleLargePageSettingsProps> = ({ parameters, onParameterChange, disabled = false }) => {
  const { t } = useTranslation();

  return (
    <Stack gap="sm">
      <Stack gap="xs">
        <Text size="sm" fw={500}>
          {t('pdfToSinglePage.processingMode.label', 'Processing mode')}
        </Text>
        <SegmentedControl
          value={parameters.processingMode}
          onChange={(value) => onParameterChange('processingMode', value as SingleLargePageParameters['processingMode'])}
          data={[
            { label: t('pdfToSinglePage.processingMode.backend', 'Backend'), value: 'backend' },
            { label: t('pdfToSinglePage.processingMode.frontend', 'Browser'), value: 'frontend' }
          ]}
          fullWidth
          disabled={disabled}
        />
        <Text size="xs" c="dimmed">
          {parameters.processingMode === 'frontend'
            ? t('pdfToSinglePage.processingMode.frontendDescription', 'Merge pages locally without uploading the document.')
            : t('pdfToSinglePage.processingMode.backendDescription', 'Use the server for extremely large PDFs or scripted workflows.')}
        </Text>
      </Stack>

      <Text size="sm" c="dimmed">
        {t('pdfToSinglePage.description', 'This tool will merge all pages of your PDF into one large single page. The width will remain the same as the original pages, but the height will be the sum of all page heights.')}
      </Text>
    </Stack>
  );
};

export default SingleLargePageSettings;
