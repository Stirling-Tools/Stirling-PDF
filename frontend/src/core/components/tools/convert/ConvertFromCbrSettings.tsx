import { Stack, Text, Checkbox } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { ConvertParameters } from "@app/hooks/tools/convert/useConvertParameters";

interface ConvertFromCbrSettingsProps {
  parameters: ConvertParameters;
  onParameterChange: <K extends keyof ConvertParameters>(key: K, value: ConvertParameters[K]) => void;
  disabled?: boolean;
}

const ConvertFromCbrSettings = ({
  parameters,
  onParameterChange,
  disabled = false
}: ConvertFromCbrSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="sm" data-testid="cbr-settings">
      <Text size="sm" fw={500}>{t("convert.cbrOptions", "CBR Options")}:</Text>

      <Checkbox
        label={t('convert.optimizeForEbook', 'Optimize PDF for ebook readers (uses Ghostscript)')}
        checked={parameters.cbrOptions.optimizeForEbook}
        onChange={(event) => onParameterChange('cbrOptions', {
          ...parameters.cbrOptions,
          optimizeForEbook: event.currentTarget.checked
        })}
        disabled={disabled}
        data-testid="optimize-ebook-checkbox"
      />
    </Stack>
  );
};

export default ConvertFromCbrSettings;
