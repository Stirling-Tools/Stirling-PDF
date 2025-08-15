import React from "react";
import { Stack, Checkbox } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { AddWatermarkParameters } from "./types";

interface WatermarkAdvancedSettingsProps {
  parameters: AddWatermarkParameters;
  onParameterChange: (key: keyof AddWatermarkParameters, value: any) => void;
  disabled?: boolean;
}

const WatermarkAdvancedSettings = ({ parameters, onParameterChange, disabled = false }: WatermarkAdvancedSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      {/* Output Options */}
      <Checkbox
        label={t('watermark.settings.convertToImage', 'Convert result to image-based PDF')}
        description={t('watermark.settings.convertToImageDesc', 'Creates a PDF with images instead of text (more secure but larger file size)')}
        checked={parameters.convertPDFToImage}
        onChange={(event) => onParameterChange('convertPDFToImage', event.currentTarget.checked)}
        disabled={disabled}
      />
    </Stack>
  );
};

export default WatermarkAdvancedSettings;