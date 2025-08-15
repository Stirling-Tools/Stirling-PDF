import React, { useRef } from "react";
import { Stack, Text, TextInput, FileButton, Button, NumberInput } from "@mantine/core";
import { useTranslation } from "react-i18next";

interface AddWatermarkParameters {
  watermarkType?: 'text' | 'image';
  watermarkText: string;
  watermarkImage?: File;
  fontSize: number;
  rotation: number;
  opacity: number;
  widthSpacer: number;
  heightSpacer: number;
  position: string;
  overrideX?: number;
  overrideY?: number;
}

interface WatermarkContentSettingsProps {
  parameters: AddWatermarkParameters;
  onParameterChange: (key: keyof AddWatermarkParameters, value: any) => void;
  disabled?: boolean;
}

const WatermarkContentSettings = ({ parameters, onParameterChange, disabled = false }: WatermarkContentSettingsProps) => {
  const { t } = useTranslation();
  const resetRef = useRef<() => void>(null);

  return (
    <Stack gap="md">
      {/* Text Watermark Settings */}
      {parameters.watermarkType === 'text' && (
        <Stack gap="sm">
          <Text size="sm" fw={500}>{t('watermark.settings.text.label', 'Watermark Text')}</Text>
          <TextInput
            placeholder={t('watermark.settings.text.placeholder', 'Enter watermark text')}
            value={parameters.watermarkText}
            onChange={(e) => onParameterChange('watermarkText', e.target.value)}
            disabled={disabled}
          />
          
          <Text size="sm" fw={500}>{t('watermark.settings.fontSize', 'Font Size')}</Text>
          <NumberInput
            value={parameters.fontSize}
            onChange={(value) => onParameterChange('fontSize', value || 12)}
            min={8}
            max={72}
            disabled={disabled}
          />
        </Stack>
      )}

      {/* Image Watermark Settings */}
      {parameters.watermarkType === 'image' && (
        <Stack gap="sm">
          <Text size="sm" fw={500}>{t('watermark.settings.image.label', 'Watermark Image')}</Text>
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
          {parameters.watermarkImage && (
            <Text size="xs" c="dimmed">
              {t('watermark.settings.image.selected', 'Selected: {{filename}}', { filename: parameters.watermarkImage.name })}
            </Text>
          )}
        </Stack>
      )}
    </Stack>
  );
};

export default WatermarkContentSettings;