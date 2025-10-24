import { Stack, Text, NumberInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { AddWatermarkParameters } from "@app/hooks/tools/addWatermark/useAddWatermarkParameters";

interface WatermarkStyleSettingsProps {
  parameters: AddWatermarkParameters;
  onParameterChange: <K extends keyof AddWatermarkParameters>(key: K, value: AddWatermarkParameters[K]) => void;
  disabled?: boolean;
}

const WatermarkStyleSettings = ({ parameters, onParameterChange, disabled = false }: WatermarkStyleSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      {/* Appearance Settings */}
      <Stack gap="sm">
        <Text size="sm" fw={500}>{t('watermark.settings.rotation', 'Rotation (degrees)')}</Text>
        <NumberInput
          value={parameters.rotation}
          onChange={(value) => onParameterChange('rotation', typeof value === 'number' ? value : (parseInt(value as string, 10) || 0))}
          min={-360}
          max={360}
          disabled={disabled}
        />

        <Text size="sm" fw={500}>{t('watermark.settings.opacity', 'Opacity (%)')}</Text>
        <NumberInput
          value={parameters.opacity}
          onChange={(value) => onParameterChange('opacity', typeof value === 'number' ? value : (parseInt(value as string, 10) || 50))}
          min={0}
          max={100}
          disabled={disabled}
        />
      </Stack>

      {/* Spacing Settings */}
      <Stack gap="sm">
        <Text size="sm" fw={500}>{t('watermark.settings.spacing.width', 'Width Spacing')}</Text>
        <NumberInput
          value={parameters.widthSpacer}
          onChange={(value) => onParameterChange('widthSpacer', typeof value === 'number' ? value : (parseInt(value as string, 10) || 50))}
          min={0}
          max={200}
          disabled={disabled}
        />

        <Text size="sm" fw={500}>{t('watermark.settings.spacing.height', 'Height Spacing')}</Text>
        <NumberInput
          value={parameters.heightSpacer}
          onChange={(value) => onParameterChange('heightSpacer', typeof value === 'number' ? value : (parseInt(value as string, 10) || 50))}
          min={0}
          max={200}
          disabled={disabled}
        />
      </Stack>

    </Stack>
  );
};

export default WatermarkStyleSettings;
