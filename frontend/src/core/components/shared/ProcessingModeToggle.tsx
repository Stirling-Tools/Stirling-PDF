import { Stack, Text, SegmentedControl } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { ProcessingMode } from '@app/types/parameters';

export interface ProcessingModeToggleProps {
  value: ProcessingMode;
  onChange: (mode: ProcessingMode) => void;
  disabled?: boolean;
  frontendDescriptionKey?: string;
  backendDescriptionKey?: string;
}

/**
 * Reusable processing mode toggle component for tools that support both
 * frontend (browser-based) and backend (server-based) processing.
 */
const ProcessingModeToggle = ({
  value,
  onChange,
  disabled = false,
  frontendDescriptionKey,
  backendDescriptionKey
}: ProcessingModeToggleProps) => {
  const { t } = useTranslation();

  const frontendDesc = frontendDescriptionKey
    ? t(frontendDescriptionKey, 'Process locally in your browser without uploading files.')
    : t('common.processingMode.defaultFrontendDesc', 'Process locally in your browser without uploading files.');

  const backendDesc = backendDescriptionKey
    ? t(backendDescriptionKey, 'Use the server to process files.')
    : t('common.processingMode.defaultBackendDesc', 'Use the server to process files.');

  return (
    <Stack gap="xs">
      <Text size="sm" fw={500}>
        {t('common.processingMode.label', 'Processing mode')}
      </Text>
      <SegmentedControl
        value={value}
        onChange={(s => {onChange(s as ProcessingMode)})}
        data={[
          {
            label: t('common.processingMode.backend', 'Backend'),
            value: 'backend'
          },
          {
            label: t('common.processingMode.frontend', 'Browser'),
            value: 'frontend'
          }
        ]}
        fullWidth
        disabled={disabled}
      />
      <Text size="xs" c="dimmed">
        {value === 'frontend' ? frontendDesc : backendDesc}
      </Text>
    </Stack>
  );
};

export default ProcessingModeToggle;
