import React from "react";
import { Stack, Text, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { AddWatermarkParameters } from "./types";

interface WatermarkWordingProps {
  parameters: AddWatermarkParameters;
  onParameterChange: (key: keyof AddWatermarkParameters, value: any) => void;
  disabled?: boolean;
}

const WatermarkWording = ({ parameters, onParameterChange, disabled = false }: WatermarkWordingProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="sm">
      <TextInput
        placeholder={t('watermark.settings.text.placeholder', 'Enter watermark text')}
        value={parameters.watermarkText}
        onChange={(e) => onParameterChange('watermarkText', e.target.value)}
        disabled={disabled}
      />
    </Stack>
  );
};

export default WatermarkWording;
