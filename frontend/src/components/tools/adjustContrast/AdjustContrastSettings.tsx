import React from 'react';
import { Stack, Slider, Text, Group, NumberInput, Divider } from '@mantine/core';
import AdjustContrastPreview from './AdjustContrastPreview';
import { useTranslation } from 'react-i18next';
import { AdjustContrastParameters } from '../../../hooks/tools/adjustContrast/useAdjustContrastParameters';

interface Props {
  parameters: AdjustContrastParameters;
  onParameterChange: <K extends keyof AdjustContrastParameters>(key: K, value: AdjustContrastParameters[K]) => void;
  disabled?: boolean;
  file?: File | null;
}

export default function AdjustContrastSettings({ parameters, onParameterChange, disabled, file }: Props) {
  const { t } = useTranslation();

  const renderSlider = (label: string, value: number, onChange: (v: number) => void) => (
    <div>
      <Text size="sm" fw={600} mb={4}>{label}: {Math.round(value)}%</Text>
      <Group gap="sm" align="center">
        <div style={{ flex: 1 }}>
          <Slider min={0} max={200} step={1} value={value} onChange={onChange} disabled={disabled} />
        </div>
        <NumberInput
          value={value}
          onChange={(v) => onChange(Number(v) || 0)}
          min={0}
          max={200}
          step={1}
          disabled={disabled}
          style={{ width: 90 }}
        />
      </Group>
    </div>
  );

  return (
    <Stack gap="md">
      {renderSlider(t('adjustContrast.contrast', 'Contrast'), parameters.contrast, (v) => onParameterChange('contrast', v as any))}
      {renderSlider(t('adjustContrast.brightness', 'Brightness'), parameters.brightness, (v) => onParameterChange('brightness', v as any))}
      {renderSlider(t('adjustContrast.saturation', 'Saturation'), parameters.saturation, (v) => onParameterChange('saturation', v as any))}

      <Divider />
      <Text size="sm" fw={700}>{t('adjustContrast.adjustColors', 'Adjust Colors')}</Text>
      {renderSlider(t('adjustContrast.red', 'Red'), parameters.red, (v) => onParameterChange('red', v as any))}
      {renderSlider(t('adjustContrast.green', 'Green'), parameters.green, (v) => onParameterChange('green', v as any))}
      {renderSlider(t('adjustContrast.blue', 'Blue'), parameters.blue, (v) => onParameterChange('blue', v as any))}
      {/* Inline accurate preview */}
      <AdjustContrastPreview file={file || null} parameters={parameters} />
    </Stack>
  );
}


