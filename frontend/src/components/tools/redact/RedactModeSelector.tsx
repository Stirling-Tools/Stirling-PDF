import { useTranslation } from 'react-i18next';
import { Select, Stack, Text } from '@mantine/core';
import { RedactMode } from '../../../hooks/tools/redact/useRedactParameters';

interface RedactModeSelectorProps {
  mode: RedactMode;
  onModeChange: (mode: RedactMode) => void;
  disabled?: boolean;
}

export default function RedactModeSelector({ mode, onModeChange, disabled }: RedactModeSelectorProps) {
  const { t } = useTranslation();

  const modeOptions = [
    {
      value: 'automatic',
      label: t('redact.modeSelector.automatic', 'Automatic'),
      disabled: false
    },
    {
      value: 'manual',
      label: t('redact.modeSelector.manual', 'Manual'),
      disabled: true // Disabled until implemented
    }
  ];

  return (
    <Stack gap="sm">
      <Text size="sm" fw={600}>
        {t('redact.modeSelector.title', 'Redaction Mode')}
      </Text>

      <Select
        value={mode}
        onChange={(value) => {
          if (value && value !== 'manual') { // Don't allow manual selection yet
            onModeChange(value as RedactMode);
          }
        }}
        disabled={disabled}
        data={modeOptions}
      />
    </Stack>
  );
}
