import React from "react";
import { Stack, Text, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { AddWatermarkParameters } from "../../../hooks/tools/addWatermark/useAddWatermarkParameters";
import { removeEmojis } from "../../../utils/textUtils";

interface WatermarkWordingProps {
  parameters: AddWatermarkParameters;
  onParameterChange: <K extends keyof AddWatermarkParameters>(key: K, value: AddWatermarkParameters[K]) => void;
  disabled?: boolean;
}

const WatermarkWording = ({ parameters, onParameterChange, disabled = false }: WatermarkWordingProps) => {
  const { t } = useTranslation();

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const filteredValue = removeEmojis(value);
    onParameterChange('watermarkText', filteredValue);
  };

  return (
    <Stack gap="sm">
      <TextInput
        placeholder={t('watermark.settings.text.placeholder', 'Enter watermark text')}
        value={parameters.watermarkText}
        onChange={handleTextChange}
        disabled={disabled}
      />
    </Stack>
  );
};

export default WatermarkWording;
