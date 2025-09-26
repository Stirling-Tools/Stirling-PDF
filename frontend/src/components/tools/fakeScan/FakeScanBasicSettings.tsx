import React, { useRef } from 'react';
import { Stack, Select, NumberInput } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { FakeScanParameters } from '../../../hooks/tools/fakeScan/useFakeScanParameters';
import { getQualityOptions, getRotationOptions, getColorspaceOptions } from './constants';
import { useAdjustFontSizeToFit } from '../../shared/fitText/textFit';

const FitLabel = ({ children }: { children: React.ReactNode }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  useAdjustFontSizeToFit(ref, { maxLines: 2 });
  return (
    <div ref={ref} style={{ lineHeight: 1.15, minHeight: '2.3em', display: 'block' }}>{children}</div>
  );
};

export default function FakeScanBasicSettings({
  parameters,
  onParameterChange,
  disabled,
}: {
  parameters: FakeScanParameters;
  onParameterChange: <K extends keyof FakeScanParameters>(
    key: K,
    value: FakeScanParameters[K]
  ) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <Stack gap="sm">
      <Select
        label={<FitLabel>{t('scannerEffect.quality', 'Scan Quality')}</FitLabel>}
        data={getQualityOptions(t)}
        value={parameters.quality}
        onChange={(v) => onParameterChange('quality', (v as any) || 'high')}
        disabled={disabled}
      />

      <Select
        label={<FitLabel>{t('scannerEffect.rotation', 'Rotation Angle')}</FitLabel>}
        data={getRotationOptions(t)}
        value={parameters.rotation}
        onChange={(v) => onParameterChange('rotation', (v as any) || 'slight')}
        disabled={disabled}
      />

      <Select
        label={<FitLabel>{t('scannerEffect.colorspace', 'Colorspace')}</FitLabel>}
        data={getColorspaceOptions(t)}
        value={parameters.colorspace}
        onChange={(v) => onParameterChange('colorspace', (v as any) || 'grayscale')}
        disabled={disabled}
      />

      <NumberInput
        label={<FitLabel>{t('scannerEffect.border', 'Border (px)')}</FitLabel>}
        value={parameters.border}
        onChange={(v) => onParameterChange('border', Number(v) || 0)}
        disabled={disabled}
        min={0}
        step={1}
      />
    </Stack>
  );
}
