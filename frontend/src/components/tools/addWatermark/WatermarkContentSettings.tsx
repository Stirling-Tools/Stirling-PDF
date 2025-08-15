import React, { useRef } from "react";
import { Stack, Text, TextInput, FileButton, Button, NumberInput, Select, ColorInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { AddWatermarkParameters } from "./types";

interface WatermarkContentSettingsProps {
  parameters: AddWatermarkParameters;
  onParameterChange: (key: keyof AddWatermarkParameters, value: any) => void;
  disabled?: boolean;
}

const WatermarkContentSettings = ({ parameters, onParameterChange, disabled = false }: WatermarkContentSettingsProps) => {
  const { t } = useTranslation();
  const resetRef = useRef<() => void>(null);

  const alphabetOptions = [
    { value: 'roman', label: t('watermark.alphabet.roman', 'Roman/Latin') },
    { value: 'arabic', label: t('watermark.alphabet.arabic', 'Arabic') },
    { value: 'japanese', label: t('watermark.alphabet.japanese', 'Japanese') },
    { value: 'korean', label: t('watermark.alphabet.korean', 'Korean') },
    { value: 'chinese', label: t('watermark.alphabet.chinese', 'Chinese') },
    { value: 'thai', label: t('watermark.alphabet.thai', 'Thai') }
  ];

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

          <Text size="sm" fw={500}>{t('watermark.settings.alphabet', 'Font/Language')}</Text>
          <Select
            value={parameters.alphabet}
            onChange={(value) => value && onParameterChange('alphabet', value)}
            data={alphabetOptions}
            disabled={disabled}
          />

          <Text size="sm" fw={500}>{t('watermark.settings.color', 'Watermark Color')}</Text>
          <ColorInput
            value={parameters.customColor}
            onChange={(value) => onParameterChange('customColor', value)}
            disabled={disabled}
            format="hex"
            swatches={['#d3d3d3', '#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff']}
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