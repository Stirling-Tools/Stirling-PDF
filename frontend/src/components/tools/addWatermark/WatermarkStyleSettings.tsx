import React from "react";
import { Stack, Text, NumberInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { AddWatermarkParameters } from "../../../hooks/tools/addWatermark/useAddWatermarkParameters";

interface WatermarkStyleSettingsProps {
  parameters: AddWatermarkParameters;
  onParameterChange: (key: keyof AddWatermarkParameters, value: any) => void;
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
          onChange={(value) => onParameterChange('rotation', value || 0)}
          min={-360}
          max={360}
          disabled={disabled}
        />

        <Text size="sm" fw={500}>{t('watermark.settings.opacity', 'Opacity (%)')}</Text>
        <NumberInput
          value={parameters.opacity}
          onChange={(value) => onParameterChange('opacity', value || 50)}
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
          onChange={(value) => onParameterChange('widthSpacer', value || 50)}
          min={0}
          max={200}
          disabled={disabled}
        />

        <Text size="sm" fw={500}>{t('watermark.settings.spacing.height', 'Height Spacing')}</Text>
        <NumberInput
          value={parameters.heightSpacer}
          onChange={(value) => onParameterChange('heightSpacer', value || 50)}
          min={0}
          max={200}
          disabled={disabled}
        />
      </Stack>

    </Stack>
  );
};

export default WatermarkStyleSettings;