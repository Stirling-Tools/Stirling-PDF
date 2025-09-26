import React, { useRef } from 'react';
import { Stack, Select, Switch, NumberInput, Divider, Group } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { FakeScanParameters } from '../../../hooks/tools/fakeScan/useFakeScanParameters';
import { getQualityOptions, getRotationOptions } from './constants';
import { useAdjustFontSizeToFit } from '../../shared/fitText/textFit';

export default function FakeScanSettings({
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

  const FitLabel = ({ children }: { children: React.ReactNode }) => {
    const ref = useRef<HTMLDivElement | null>(null);
    useAdjustFontSizeToFit(ref, { maxLines: 2 });
    return (
      <div
        ref={ref}
        style={{
          lineHeight: 1.15,
          minHeight: '2.3em',
          display: 'block'
        }}
      >
        {children}
      </div>
    );
  };

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

      <Divider />

      <Switch
        checked={parameters.advancedEnabled}
        onChange={(e) => onParameterChange('advancedEnabled', e.currentTarget.checked)}
        label={<FitLabel>{t('scannerEffect.advancedSettings', 'Enable Advanced Scan Settings')}</FitLabel>}
        disabled={disabled}
      />

      {parameters.advancedEnabled && (
        <Stack gap="xs" style={{ border: '1px solid var(--border-color)', padding: 12, borderRadius: 8 }}>
          <Select
            label={<FitLabel>{t('scannerEffect.colorspace', 'Colorspace')}</FitLabel>}
            data={[
              { value: 'grayscale', label: t('scannerEffect.colorspace.grayscale', 'Grayscale') },
              { value: 'color', label: t('scannerEffect.colorspace.color', 'Color') },
            ]}
            value={parameters.colorspace}
            onChange={(v) => onParameterChange('colorspace', (v as any) || 'grayscale')}
            disabled={disabled}
          />

          <Divider />

          <Group grow>
            <NumberInput
              label={<FitLabel>{t('scannerEffect.border', 'Border (px)')}</FitLabel>}
              value={parameters.border}
              onChange={(v) => onParameterChange('border', Number(v) || 0)}
              disabled={disabled}
              min={0}
              step={1}
            />
            <NumberInput
              label={<FitLabel>{t('scannerEffect.rotate', 'Base Rotation (degrees)')}</FitLabel>}
              value={parameters.rotate}
              onChange={(v) => onParameterChange('rotate', Number(v) || 0)}
              disabled={disabled}
              step={1}
            />
            <NumberInput
              label={<FitLabel>{t('scannerEffect.rotateVariance', 'Rotation Variance (degrees)')}</FitLabel>}
              value={parameters.rotateVariance}
              onChange={(v) => onParameterChange('rotateVariance', Number(v) || 0)}
              disabled={disabled}
              step={1}
            />
          </Group>

          <Divider />

          <Group grow>
            <NumberInput
              label={<FitLabel>{t('scannerEffect.brightness', 'Brightness')}</FitLabel>}
              value={parameters.brightness}
              onChange={(v) => onParameterChange('brightness', Number(v) || 0)}
              disabled={disabled}
              step={0.01}
            />
            <NumberInput
              label={<FitLabel>{t('scannerEffect.contrast', 'Contrast')}</FitLabel>}
              value={parameters.contrast}
              onChange={(v) => onParameterChange('contrast', Number(v) || 0)}
              disabled={disabled}
              step={0.01}
            />
          </Group>

          <Divider />

          <Group grow>
            <NumberInput
              label={<FitLabel>{t('scannerEffect.blur', 'Blur')}</FitLabel>}
              value={parameters.blur}
              onChange={(v) => onParameterChange('blur', Number(v) || 0)}
              disabled={disabled}
              step={0.1}
            />
            <NumberInput
              label={<FitLabel>{t('scannerEffect.noise', 'Noise')}</FitLabel>}
              value={parameters.noise}
              onChange={(v) => onParameterChange('noise', Number(v) || 0)}
              disabled={disabled}
              step={0.1}
            />
          </Group>

          <Divider />

          <Group grow>
            <Switch
              checked={parameters.yellowish}
              onChange={(e) => onParameterChange('yellowish', e.currentTarget.checked)}
              label={<FitLabel>{t('scannerEffect.yellowish', 'Yellowish (simulate old paper)')}</FitLabel>}
              disabled={disabled}
            />
            <NumberInput
              label={<FitLabel>{t('scannerEffect.resolution', 'Resolution (DPI)')}</FitLabel>}
              value={parameters.resolution}
              onChange={(v) => onParameterChange('resolution', Number(v) || 72)}
              disabled={disabled}
              step={1}
              min={72}
            />
          </Group>
        </Stack>
      )}
    </Stack>
  );
}


