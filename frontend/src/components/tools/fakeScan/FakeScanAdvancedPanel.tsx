import React, { useRef } from 'react';
import { Group, NumberInput, Slider, Stack, Switch } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { FakeScanParameters } from '../../../hooks/tools/fakeScan/useFakeScanParameters';
import { useAdjustFontSizeToFit } from '../../shared/fitText/textFit';
// No basic option imports here; this panel focuses on advanced sliders only

type Props = {
  parameters: FakeScanParameters;
  onParameterChange: <K extends keyof FakeScanParameters>(key: K, value: FakeScanParameters[K]) => void;
  disabled?: boolean;
};

const FitLabel = ({ children }: { children: React.ReactNode }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  useAdjustFontSizeToFit(ref, { maxLines: 2 });
  return (
    <div ref={ref} style={{ lineHeight: 1.15, minHeight: '2.3em', display: 'block' }}>{children}</div>
  );
};

export default function FakeScanAdvancedPanel({ parameters, onParameterChange, disabled }: Props) {
  const { t } = useTranslation();

  const setAdvanced = () => {
    if (!parameters.advancedEnabled) onParameterChange('advancedEnabled', true as any);
  };

  return (
    <Stack gap="md">
      <Group grow>
        <div>
          <FitLabel>{t('scannerEffect.brightness', 'Brightness')}</FitLabel>
          <Slider min={0.5} max={1.5} step={0.01} value={parameters.brightness} onChange={(v) => { setAdvanced(); onParameterChange('brightness', v as any); }} disabled={disabled} />
        </div>
        <div>
          <FitLabel>{t('scannerEffect.contrast', 'Contrast')}</FitLabel>
          <Slider min={0.5} max={1.5} step={0.01} value={parameters.contrast} onChange={(v) => { setAdvanced(); onParameterChange('contrast', v as any); }} disabled={disabled} />
        </div>
      </Group>

      <Group grow>
        <div>
          <FitLabel>{t('scannerEffect.rotation', 'Rotation')}</FitLabel>
          <Slider min={-10} max={10} step={1} value={parameters.rotate} onChange={(v) => { setAdvanced(); onParameterChange('rotate', v as any); onParameterChange('rotateVariance', 0 as any); }} disabled={disabled} />
        </div>
        <div>
          <FitLabel>{t('scannerEffect.blur', 'Blur')}</FitLabel>
          <Slider min={0} max={5} step={0.1} value={parameters.blur} onChange={(v) => { setAdvanced(); onParameterChange('blur', v as any); }} disabled={disabled} />
        </div>
      </Group>

      <Group grow>
        <div>
          <FitLabel>{t('scannerEffect.noise', 'Noise')}</FitLabel>
          <Slider min={0} max={10} step={0.1} value={parameters.noise} onChange={(v) => { setAdvanced(); onParameterChange('noise', v as any); }} disabled={disabled} />
        </div>
        <div style={{ marginTop: '8px' }}>
          <FitLabel>{t('scannerEffect.yellowish', 'Yellowish (simulate old paper)')}</FitLabel>
          <div style={{ marginTop: '8px' }}/>
          <Switch checked={parameters.yellowish} onChange={(e) => { setAdvanced(); onParameterChange('yellowish', e.currentTarget.checked as any); }} disabled={disabled} />
        </div>
      </Group>

      <Group grow>
        <div>
          <FitLabel>{t('scannerEffect.resolution', 'Resolution (DPI)')}</FitLabel>
          <NumberInput value={parameters.resolution} onChange={(v) => { setAdvanced(); onParameterChange('resolution', Number(v) || 72 as any); }} disabled={disabled} min={72} step={1} />
        </div>
      </Group>

    </Stack>
  );
}


