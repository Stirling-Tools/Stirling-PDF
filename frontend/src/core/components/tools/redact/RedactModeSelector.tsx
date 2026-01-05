import { useTranslation } from 'react-i18next';
import { RedactMode } from '@app/hooks/tools/redact/useRedactParameters';
import ButtonSelector from '@app/components/shared/ButtonSelector';

interface RedactModeSelectorProps {
  mode: RedactMode;
  onModeChange: (mode: RedactMode) => void;
  disabled?: boolean;
  hasFilesSelected?: boolean;  // Files are selected in workbench
  hasAnyFiles?: boolean;       // Any files exist in workbench (for manual mode)
}

export default function RedactModeSelector({ 
  mode, 
  onModeChange, 
  disabled, 
  hasFilesSelected = false,
  hasAnyFiles = false 
}: RedactModeSelectorProps) {
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
          disabled: !hasFilesSelected, // Automatic requires files to be selected
          tooltip: !hasFilesSelected 
            ? t('redact.modeSelector.automaticDisabledTooltip', 'Select files in the file manager to redact multiple files at once')
            : undefined,
        },
        {
          value: 'manual' as const,
          label: t('redact.modeSelector.manual', 'Manual'),
          disabled: !hasAnyFiles, // Manual mode works if any files exist in workbench
        },
      ]}
      disabled={disabled}
    />
  );
}
