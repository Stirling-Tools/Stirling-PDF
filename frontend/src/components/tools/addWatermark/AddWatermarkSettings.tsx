import React, { useRef } from "react";
import { Button, Stack, Text, NumberInput, Select, TextInput, FileButton } from "@mantine/core";
import { useTranslation } from "react-i18next";

interface AddWatermarkParameters {
  watermarkType: 'text' | 'image';
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

interface AddWatermarkSettingsProps {
  parameters: AddWatermarkParameters;
  onParameterChange: (key: keyof AddWatermarkParameters, value: any) => void;
  disabled?: boolean;
}

const AddWatermarkSettings = ({ parameters, onParameterChange, disabled = false }: AddWatermarkSettingsProps) => {
  const { t } = useTranslation();
  const resetRef = useRef<() => void>(null);

  const positionOptions = [
    { value: 'topLeft', label: 'Top Left' },
    { value: 'topCenter', label: 'Top Center' },
    { value: 'topRight', label: 'Top Right' },
    { value: 'centerLeft', label: 'Center Left' },
    { value: 'center', label: 'Center' },
    { value: 'centerRight', label: 'Center Right' },
    { value: 'bottomLeft', label: 'Bottom Left' },
    { value: 'bottomCenter', label: 'Bottom Center' },
    { value: 'bottomRight', label: 'Bottom Right' }
  ];

  return (
    <Stack gap="md">
      {/* Watermark Type Selection */}
      <Stack gap="sm">
        <Text size="sm" fw={500}>Watermark Type</Text>
        <div style={{ display: 'flex', gap: '4px' }}>
          <Button
            variant={parameters.watermarkType === 'text' ? 'filled' : 'outline'}
            color={parameters.watermarkType === 'text' ? 'blue' : 'gray'}
            onClick={() => onParameterChange('watermarkType', 'text')}
            disabled={disabled}
            style={{ flex: 1, height: 'auto', minHeight: '40px', fontSize: '11px' }}
          >
            <div style={{ textAlign: 'center', lineHeight: '1.1', fontSize: '11px' }}>
              Text
            </div>
          </Button>
          <Button
            variant={parameters.watermarkType === 'image' ? 'filled' : 'outline'}
            color={parameters.watermarkType === 'image' ? 'blue' : 'gray'}
            onClick={() => onParameterChange('watermarkType', 'image')}
            disabled={disabled}
            style={{ flex: 1, height: 'auto', minHeight: '40px', fontSize: '11px' }}
          >
            <div style={{ textAlign: 'center', lineHeight: '1.1', fontSize: '11px' }}>
              Image
            </div>
          </Button>
        </div>
      </Stack>

      {/* Text Watermark Settings */}
      {parameters.watermarkType === 'text' && (
        <Stack gap="sm">
          <Text size="sm" fw={500}>Watermark Text</Text>
          <TextInput
            placeholder="Enter watermark text"
            value={parameters.watermarkText}
            onChange={(e) => onParameterChange('watermarkText', e.target.value)}
            disabled={disabled}
          />
          
          <Text size="sm" fw={500}>Font Size</Text>
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
          <Text size="sm" fw={500}>Watermark Image</Text>
          <FileButton
            resetRef={resetRef}
            onChange={(file) => onParameterChange('watermarkImage', file)}
            accept="image/*"
            disabled={disabled}
          >
            {(props) => (
              <Button {...props} variant="outline" fullWidth>
                {parameters.watermarkImage ? parameters.watermarkImage.name : 'Choose Image'}
              </Button>
            )}
          </FileButton>
          {parameters.watermarkImage && (
            <Text size="xs" c="dimmed">
              Selected: {parameters.watermarkImage.name}
            </Text>
          )}
        </Stack>
      )}

      {/* Position Settings */}
      <Stack gap="sm">
        <Text size="sm" fw={500}>Position</Text>
        <Select
          value={parameters.position}
          onChange={(value) => value && onParameterChange('position', value)}
          data={positionOptions}
          disabled={disabled}
        />
      </Stack>

      {/* Appearance Settings */}
      <Stack gap="sm">
        <Text size="sm" fw={500}>Rotation (degrees)</Text>
        <NumberInput
          value={parameters.rotation}
          onChange={(value) => onParameterChange('rotation', value || 0)}
          min={-360}
          max={360}
          disabled={disabled}
        />

        <Text size="sm" fw={500}>Opacity (%)</Text>
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
        <Text size="sm" fw={500}>Width Spacing</Text>
        <NumberInput
          value={parameters.widthSpacer}
          onChange={(value) => onParameterChange('widthSpacer', value || 50)}
          min={0}
          max={200}
          disabled={disabled}
        />

        <Text size="sm" fw={500}>Height Spacing</Text>
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

export default AddWatermarkSettings;