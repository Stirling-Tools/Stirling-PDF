import React from "react";
import { Stack } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { AddWatermarkParameters } from "../../../hooks/tools/addWatermark/useAddWatermarkParameters";
import FileUploadButton from "../../shared/FileUploadButton";

interface WatermarkImageFileProps {
  parameters: AddWatermarkParameters;
  onParameterChange: (key: keyof AddWatermarkParameters, value: any) => void;
  disabled?: boolean;
}

const WatermarkImageFile = ({ parameters, onParameterChange, disabled = false }: WatermarkImageFileProps) => {
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

export default WatermarkImageFile;
