import { Stack, NumberInput, Select, SegmentedControl, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { AdjustPageScaleParameters, PageSize } from "../../../hooks/tools/adjustPageScale/useAdjustPageScaleParameters";

interface AdjustPageScaleSettingsProps {
  parameters: AdjustPageScaleParameters;
  onParameterChange: <K extends keyof AdjustPageScaleParameters>(key: K, value: AdjustPageScaleParameters[K]) => void;
  disabled?: boolean;
}

const AdjustPageScaleSettings = ({ parameters, onParameterChange, disabled = false }: AdjustPageScaleSettingsProps) => {
  const { t } = useTranslation();

  const pageSizeOptions = [
    { value: PageSize.KEEP, label: t('adjustPageScale.pageSize.keep', 'Keep Original Size') },
    { value: PageSize.A0, label: 'A0' },
    { value: PageSize.A1, label: 'A1' },
    { value: PageSize.A2, label: 'A2' },
    { value: PageSize.A3, label: 'A3' },
    { value: PageSize.A4, label: 'A4' },
    { value: PageSize.A5, label: 'A5' },
    { value: PageSize.A6, label: 'A6' },
    { value: PageSize.LETTER, label: t('adjustPageScale.pageSize.letter', 'Letter') },
    { value: PageSize.LEGAL, label: t('adjustPageScale.pageSize.legal', 'Legal') },
  ];

  return (
    <Stack gap="md">
      <Stack gap="xs">
        <Text size="sm" fw={500}>
          {t('adjustPageScale.processingMode.label', 'Processing mode')}
        </Text>
        <SegmentedControl
          value={parameters.processingMode}
          onChange={(value) => onParameterChange('processingMode', value as AdjustPageScaleParameters['processingMode'])}
          data={[
            { label: t('adjustPageScale.processingMode.backend', 'Backend'), value: 'backend' },
            { label: t('adjustPageScale.processingMode.frontend', 'Browser'), value: 'frontend' }
          ]}
          fullWidth
          disabled={disabled}
        />
        <Text size="xs" c="dimmed">
          {parameters.processingMode === 'frontend'
            ? t('adjustPageScale.processingMode.frontendDescription', 'Resize pages locally using pdf-lib.')
            : t('adjustPageScale.processingMode.backendDescription', 'Use the server for complex scaling workflows.')}
        </Text>
      </Stack>

      <NumberInput
        label={t('adjustPageScale.scaleFactor.label', 'Scale Factor')}
        value={parameters.scaleFactor}
        onChange={(value) => onParameterChange('scaleFactor', typeof value === 'number' ? value : 1.0)}
        min={0.1}
        max={10.0}
        step={0.1}
        decimalScale={2}
        disabled={disabled}
      />

      <Select
        label={t('adjustPageScale.pageSize.label', 'Target Page Size')}
        value={parameters.pageSize}
        onChange={(value) => {
          if (value && Object.values(PageSize).includes(value as PageSize)) {
            onParameterChange('pageSize', value as PageSize);
          }
        }}
        data={pageSizeOptions}
        disabled={disabled}
      />
    </Stack>
  );
};

export default AdjustPageScaleSettings;
