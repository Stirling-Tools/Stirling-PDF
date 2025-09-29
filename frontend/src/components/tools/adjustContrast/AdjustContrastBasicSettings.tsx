import React from 'react';
import { Stack, Slider, Text, Group, NumberInput } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { AdjustContrastParameters } from '../../../hooks/tools/adjustContrast/useAdjustContrastParameters';

interface Props {
  parameters: AdjustContrastParameters;
  onParameterChange: <K extends keyof AdjustContrastParameters>(key: K, value: AdjustContrastParameters[K]) => void;
  disabled?: boolean;
}

export default function AdjustContrastBasicSettings({ parameters, onParameterChange, disabled }: Props) {
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
    </Stack>
  );
}


