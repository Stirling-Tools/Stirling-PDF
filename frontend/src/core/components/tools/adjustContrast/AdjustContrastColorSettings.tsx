import { Stack } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { AdjustContrastParameters } from '@app/hooks/tools/adjustContrast/useAdjustContrastParameters';
import SliderWithInput from '@app/components/shared/sliderWithInput/SliderWithInput';

interface Props {
  parameters: AdjustContrastParameters;
  onParameterChange: <K extends keyof AdjustContrastParameters>(key: K, value: AdjustContrastParameters[K]) => void;
  disabled?: boolean;
}

export default function AdjustContrastColorSettings({ parameters, onParameterChange, disabled }: Props) {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      <SliderWithInput label={t('adjustContrast.red', 'Red')} value={parameters.red} onChange={(v) => onParameterChange('red', v as any)} disabled={disabled} />
      <SliderWithInput label={t('adjustContrast.green', 'Green')} value={parameters.green} onChange={(v) => onParameterChange('green', v as any)} disabled={disabled} />
      <SliderWithInput label={t('adjustContrast.blue', 'Blue')} value={parameters.blue} onChange={(v) => onParameterChange('blue', v as any)} disabled={disabled} />
    </Stack>
  );
}


