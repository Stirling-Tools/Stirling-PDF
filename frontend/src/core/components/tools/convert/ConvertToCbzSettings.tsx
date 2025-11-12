import { Stack, Text, NumberInput } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { ConvertParameters } from '@app/hooks/tools/convert/useConvertParameters';

interface ConvertToCbzSettingsProps {
  parameters: ConvertParameters;
  onParameterChange: <K extends keyof ConvertParameters>(key: K, value: ConvertParameters[K]) => void;
  disabled?: boolean;
}

const ConvertToCbzSettings = ({
  parameters,
  onParameterChange,
  disabled = false
}: ConvertToCbzSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="sm" data-testid="cbz-output-settings">
      <Text size="sm" fw={500}>{t('convert.cbzOutputOptions', 'PDF to CBZ Options')}:</Text>

      <NumberInput
        data-testid="cbz-dpi-input"
        label={t('convert.cbzDpi', 'DPI for image rendering')}
        value={parameters.cbzOutputOptions.dpi}
        onChange={(val) => typeof val === 'number' && onParameterChange('cbzOutputOptions', {
          ...parameters.cbzOutputOptions,
          dpi: val
        })}
        min={72}
        max={600}
        step={1}
        disabled={disabled}
      />
    </Stack>
  );
};

export default ConvertToCbzSettings;
