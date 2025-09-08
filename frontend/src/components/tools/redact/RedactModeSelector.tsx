import { useTranslation } from 'react-i18next';
import { Button, Stack, Text } from '@mantine/core';
import { RedactMode } from '../../../hooks/tools/redact/useRedactParameters';

interface RedactModeSelectorProps {
  mode: RedactMode;
  onModeChange: (mode: RedactMode) => void;
  disabled?: boolean;
}

export default function RedactModeSelector({ mode, onModeChange, disabled }: RedactModeSelectorProps) {
  const { t } = useTranslation();

  return (
    <Stack gap="sm">
      <Text size="sm" fw={600}>
        {t('redact.modeSelector.title', 'Redaction Mode')}
      </Text>

      <div style={{ display: 'flex', gap: '4px' }}>
        <Button
          variant={mode === 'automatic' ? 'filled' : 'outline'}
          color={mode === 'automatic' ? 'blue' : 'var(--text-muted)'}
          onClick={() => onModeChange('automatic')}
          disabled={disabled}
          style={{ flex: 1, height: 'auto', minHeight: '40px', fontSize: '11px' }}
        >
          <div style={{ textAlign: 'center', lineHeight: '1.1', fontSize: '11px' }}>
            {t('redact.modeSelector.automatic', 'Automatic')}
          </div>
        </Button>
        <Button
          variant={mode === 'manual' ? 'filled' : 'outline'}
          color={mode === 'manual' ? 'blue' : 'var(--text-muted)'}
          onClick={() => onModeChange('manual')}
          disabled={disabled || true} // Keep manual disabled until implemented
          style={{ flex: 1, height: 'auto', minHeight: '40px', fontSize: '11px' }}
        >
          <div style={{ textAlign: 'center', lineHeight: '1.1', fontSize: '11px' }}>
            {t('redact.modeSelector.manual', 'Manual')}
          </div>
        </Button>
      </div>
    </Stack>
  );
}
