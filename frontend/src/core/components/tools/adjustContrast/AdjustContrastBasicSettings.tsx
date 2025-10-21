import { Stack } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { AdjustContrastParameters } from '@app/hooks/tools/adjustContrast/useAdjustContrastParameters';
import SliderWithInput from '@app/components/shared/sliderWithInput/SliderWithInput';

interface Props {
  parameters: AdjustContrastParameters;
  onParameterChange: <K extends keyof AdjustContrastParameters>(key: K, value: AdjustContrastParameters[K]) => void;
  disabled?: boolean;
}

export default function AdjustContrastBasicSettings({ parameters, onParameterChange, disabled }: Props) {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      <SliderWithInput label={t('adjustContrast.contrast', 'Contrast')} value={parameters.contrast} onChange={(v) => onParameterChange('contrast', v as any)} disabled={disabled} />
      <SliderWithInput label={t('adjustContrast.brightness', 'Brightness')} value={parameters.brightness} onChange={(v) => onParameterChange('brightness', v as any)} disabled={disabled} />
      <SliderWithInput label={t('adjustContrast.saturation', 'Saturation')} value={parameters.saturation} onChange={(v) => onParameterChange('saturation', v as any)} disabled={disabled} />
    </Stack>
  );
}


