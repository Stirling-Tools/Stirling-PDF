import { useTranslation } from 'react-i18next';
import { RedactMode } from '../../../hooks/tools/redact/useRedactParameters';
import ButtonSelector from '../../shared/ButtonSelector';

interface RedactModeSelectorProps {
  mode: RedactMode;
  onModeChange: (mode: RedactMode) => void;
  disabled?: boolean;
}

export default function RedactModeSelector({ mode, onModeChange, disabled }: RedactModeSelectorProps) {
  const { t } = useTranslation();

  return (
    <ButtonSelector
      label={t('redact.modeSelector.mode', 'Mode')}
      value={mode}
      onChange={onModeChange}
      options={[
        {
          value: 'automatic' as const,
          label: t('redact.modeSelector.automatic', 'Automatic'),
        },
        {
          value: 'manual' as const,
          label: t('redact.modeSelector.manual', 'Manual'),
          disabled: true, // Keep manual mode disabled until implemented
        },
      ]}
      disabled={disabled}
    />
  );
}
