import React from 'react';
import { useTranslation } from 'react-i18next';
import { NumberInput, Stack } from '@mantine/core';
import { ScannerImageSplitParameters } from '@app/hooks/tools/scannerImageSplit/useScannerImageSplitParameters';

interface ScannerImageSplitSettingsProps {
  parameters: ScannerImageSplitParameters;
  onParameterChange: <K extends keyof ScannerImageSplitParameters>(key: K, value: ScannerImageSplitParameters[K]) => void;
  disabled?: boolean;
}

const ScannerImageSplitSettings: React.FC<ScannerImageSplitSettingsProps> = ({
  parameters,
  onParameterChange,
  disabled = false
}) => {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      <NumberInput
        label={t('ScannerImageSplit.selectText.1', 'Angle Threshold:')}
        description={t('ScannerImageSplit.selectText.2', 'Sets the minimum absolute angle required for the image to be rotated (default: 10).')}
        value={parameters.angle_threshold}
        onChange={(value) => onParameterChange('angle_threshold', Number(value) || 10)}
        min={0}
        step={1}
        disabled={disabled}
      />

      <NumberInput
        label={t('ScannerImageSplit.selectText.3', 'Tolerance:')}
        description={t('ScannerImageSplit.selectText.4', 'Determines the range of colour variation around the estimated background colour (default: 30).')}
        value={parameters.tolerance}
        onChange={(value) => onParameterChange('tolerance', Number(value) || 30)}
        min={0}
        step={1}
        disabled={disabled}
      />

      <NumberInput
        label={t('ScannerImageSplit.selectText.5', 'Minimum Area:')}
        description={t('ScannerImageSplit.selectText.6', 'Sets the minimum area threshold for a photo (default: 10000).')}
        value={parameters.min_area}
        onChange={(value) => onParameterChange('min_area', Number(value) || 10000)}
        min={0}
        step={100}
        disabled={disabled}
      />

      <NumberInput
        label={t('ScannerImageSplit.selectText.7', 'Minimum Contour Area:')}
        description={t('ScannerImageSplit.selectText.8', 'Sets the minimum contour area threshold for a photo.')}
        value={parameters.min_contour_area}
        onChange={(value) => onParameterChange('min_contour_area', Number(value) || 500)}
        min={0}
        step={10}
        disabled={disabled}
      />

      <NumberInput
        label={t('ScannerImageSplit.selectText.9', 'Border Size:')}
        description={t('ScannerImageSplit.selectText.10', 'Sets the size of the border added and removed to prevent white borders in the output (default: 1).')}
        value={parameters.border_size}
        onChange={(value) => onParameterChange('border_size', Number(value) || 1)}
        min={0}
        step={1}
        disabled={disabled}
      />
    </Stack>
  );
};

export default ScannerImageSplitSettings;