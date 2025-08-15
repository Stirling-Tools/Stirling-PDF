import React from "react";
import { Stack } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { AddWatermarkParameters } from "../../../hooks/tools/addWatermark/useAddWatermarkParameters";
import FileUploadButton from "../../shared/FileUploadButton";

interface WatermarkFileProps {
  parameters: AddWatermarkParameters;
  onParameterChange: (key: keyof AddWatermarkParameters, value: any) => void;
  disabled?: boolean;
}

const WatermarkFile = ({ parameters, onParameterChange, disabled = false }: WatermarkFileProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="sm">
      <FileUploadButton
        file={parameters.watermarkImage}
        onChange={(file) => onParameterChange('watermarkImage', file)}
        accept="image/*"
        disabled={disabled}
        placeholder={t('watermark.settings.image.choose', 'Choose Image')}
      />
    </Stack>
  );
};

export default WatermarkFile;
