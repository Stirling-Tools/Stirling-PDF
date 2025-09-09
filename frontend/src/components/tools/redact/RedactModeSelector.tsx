import { useTranslation } from 'react-i18next';
import { Stack, Text } from '@mantine/core';
import { RedactMode } from '../../../hooks/tools/redact/useRedactParameters';
import ButtonSelector from '../../shared/ButtonSelector';

interface RedactModeSelectorProps {
  mode: RedactMode;
  onModeChange: (mode: RedactMode) => void;
  disabled?: boolean;
}

export default function RedactModeSelector({ mode, onModeChange, disabled }: RedactModeSelectorProps) {
  const { t } = useTranslation();

  const options = [
    {
      value: 'automatic' as const,
      label: t('redact.modeSelector.automatic', 'Automatic')
    },
    {
      value: 'manual' as const,
      label: t('redact.modeSelector.manual', 'Manual'),
      disabled: true // Keep manual mode disabled until implemented
    }
  ];

  return (
    <Stack gap="sm">
      <Text size="sm" fw={600}>
        {t('redact.modeSelector.mode', 'Mode')}
      </Text>

      <ButtonSelector
        value={mode}
        onChange={onModeChange}
        options={options}
        disabled={disabled}
      />
    </Stack>
  );
}
