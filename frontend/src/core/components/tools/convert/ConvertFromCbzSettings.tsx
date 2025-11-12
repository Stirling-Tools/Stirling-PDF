import { Stack, Text, Checkbox } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { ConvertParameters } from '@app/hooks/tools/convert/useConvertParameters';

interface ConvertFromCbzSettingsProps {
  parameters: ConvertParameters;
  onParameterChange: <K extends keyof ConvertParameters>(key: K, value: ConvertParameters[K]) => void;
  disabled?: boolean;
}

const ConvertFromCbzSettings = ({
  parameters,
  onParameterChange,
  disabled = false
}: ConvertFromCbzSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="sm" data-testid="cbz-settings">
      <Text size="sm" fw={500}>{t('convert.cbzOptions', 'CBZ to PDF Options')}:</Text>

      <Checkbox
        label={t('convert.optimizeForEbook', 'Optimize PDF for ebook readers (uses Ghostscript)')}
        checked={parameters.cbzOptions.optimizeForEbook}
        onChange={(event) => onParameterChange('cbzOptions', {
          ...parameters.cbzOptions,
          optimizeForEbook: event.currentTarget.checked
        })}
        disabled={disabled}
        data-testid="optimize-ebook-checkbox"
      />
    </Stack>
  );
};

export default ConvertFromCbzSettings;
