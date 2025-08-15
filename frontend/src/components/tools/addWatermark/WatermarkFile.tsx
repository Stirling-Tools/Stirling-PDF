import React, { useRef } from "react";
import { Stack, Text, FileButton, Button } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { AddWatermarkParameters } from "./types";

interface WatermarkFileProps {
  parameters: AddWatermarkParameters;
  onParameterChange: (key: keyof AddWatermarkParameters, value: any) => void;
  disabled?: boolean;
}

const WatermarkFile = ({ parameters, onParameterChange, disabled = false }: WatermarkFileProps) => {
  const { t } = useTranslation();
  const resetRef = useRef<() => void>(null);

  return (
    <Stack gap="sm">
      <FileButton
        resetRef={resetRef}
        onChange={(file) => onParameterChange('watermarkImage', file)}
        accept="image/*"
        disabled={disabled}
      >
        {(props) => (
          <Button {...props} variant="outline" fullWidth>
            {parameters.watermarkImage ? parameters.watermarkImage.name : t('watermark.settings.image.choose', 'Choose Image')}
          </Button>
        )}
      </FileButton>
    </Stack>
  );
};

export default WatermarkFile;
