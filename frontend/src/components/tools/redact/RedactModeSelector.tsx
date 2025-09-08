import { useTranslation } from 'react-i18next';
import { Radio, Stack, Text, Tooltip } from '@mantine/core';
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

      <Radio.Group
        value={mode}
        onChange={(value) => onModeChange(value as RedactMode)}
      >
        <Stack gap="xs">
          <Radio
            value="automatic"
            label={t('redact.modeSelector.automatic', 'Automatic')}
            description={t('redact.modeSelector.automaticDesc', 'Redact text based on search terms')}
            disabled={disabled}
          />

          <Tooltip
            label={t('redact.modeSelector.manualComingSoon', 'Manual redaction coming soon')}
            position="right"
          >
            <div>
              <Radio
                value="manual"
                label={t('redact.modeSelector.manual', 'Manual')}
                description={t('redact.modeSelector.manualDesc', 'Click and drag to redact specific areas')}
                disabled={true}
                style={{ opacity: 0.5 }}
              />
            </div>
          </Tooltip>
        </Stack>
      </Radio.Group>
    </Stack>
  );
}
