import React from "react";
import { Stack, Text, NumberInput, Select, ColorInput, Checkbox } from "@mantine/core";
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
  alphabet: string;
  customColor: string;
  convertPDFToImage: boolean;
}

interface WatermarkStyleSettingsProps {
  parameters: AddWatermarkParameters;
  onParameterChange: (key: keyof AddWatermarkParameters, value: any) => void;
  disabled?: boolean;
}

const WatermarkStyleSettings = ({ parameters, onParameterChange, disabled = false }: WatermarkStyleSettingsProps) => {
  const { t } = useTranslation();

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
      {/* Text-specific settings */}
      {parameters.watermarkType === 'text' && (
        <Stack gap="sm">
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

      {/* Output Options */}
      <Stack gap="sm">
        <Checkbox
          label={t('watermark.settings.convertToImage', 'Convert result to image-based PDF')}
          description={t('watermark.settings.convertToImageDesc', 'Creates a PDF with images instead of text (more secure but larger file size)')}
          checked={parameters.convertPDFToImage}
          onChange={(event) => onParameterChange('convertPDFToImage', event.currentTarget.checked)}
          disabled={disabled}
        />
      </Stack>
    </Stack>
  );
};

export default WatermarkStyleSettings;