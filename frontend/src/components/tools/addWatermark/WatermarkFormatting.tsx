import { Stack, Checkbox, Group, SegmentedControl, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { AddWatermarkParameters } from "../../../hooks/tools/addWatermark/useAddWatermarkParameters";
import NumberInputWithUnit from "../shared/NumberInputWithUnit";

interface WatermarkFormattingProps {
  parameters: AddWatermarkParameters;
  onParameterChange: <K extends keyof AddWatermarkParameters>(key: K, value: AddWatermarkParameters[K]) => void;
  disabled?: boolean;
}

const WatermarkFormatting = ({ parameters, onParameterChange, disabled = false }: WatermarkFormattingProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      <Stack gap="xs">
        <Text size="sm" fw={500}>
          {t("watermark.processingMode.label", "Processing mode")}
        </Text>
        <SegmentedControl
          value={parameters.processingMode}
          onChange={(value) => onParameterChange('processingMode', value as 'backend' | 'frontend')}
          data={[
            { label: t('watermark.processingMode.backend', 'Backend'), value: 'backend' },
            { label: t('watermark.processingMode.frontend', 'Browser'), value: 'frontend' },
          ]}
          disabled={disabled}
        />
        <Text size="xs" c="dimmed">
          {parameters.processingMode === 'frontend'
            ? t('watermark.processingMode.frontendDescription', 'Process the watermark directly in your browser without uploading files.')
            : t('watermark.processingMode.backendDescription', 'Use the server to apply the watermark (recommended for large files or flattening).')}
        </Text>
      </Stack>

      {/* Size - single row */}
      <NumberInputWithUnit
        label={t('watermark.settings.size', 'Size')}
        value={parameters.fontSize}
        onChange={(value) => onParameterChange('fontSize', typeof value === 'number' ? value : 12)}
        unit={parameters.watermarkType === 'text' ? 'pt' : 'px'}
        min={1}
        disabled={disabled}
      />

      {/* Position & Appearance - 2 per row */}
      <Group grow align="flex-start">
        <NumberInputWithUnit
          label={t('watermark.settings.rotation', 'Rotation')}
          value={parameters.rotation}
          onChange={(value) => onParameterChange('rotation', typeof value === 'number' ? value : 0)}
          unit="°"
          min={-360}
          max={360}
          disabled={disabled}
        />
        <NumberInputWithUnit
          label={t('watermark.settings.opacity', 'Opacity')}
          value={parameters.opacity}
          onChange={(value) => onParameterChange('opacity', typeof value === 'number' ? value : 50)}
          unit="%"
          min={0}
          max={100}
          disabled={disabled}
        />
      </Group>

      {/* Spacing - 2 per row */}
      <Group grow align="flex-start">
        <NumberInputWithUnit
          label={t('watermark.settings.spacing.horizontal', 'Horizontal Spacing')}
          value={parameters.widthSpacer}
          onChange={(value) => onParameterChange('widthSpacer', typeof value === 'number' ? value : 50)}
          unit="px"
          min={0}
          max={200}
          disabled={disabled}
        />
        <NumberInputWithUnit
          label={t('watermark.settings.spacing.vertical', 'Vertical Spacing')}
          value={parameters.heightSpacer}
          onChange={(value) => onParameterChange('heightSpacer', typeof value === 'number' ? value : 50)}
          unit="px"
          min={0}
          max={200}
          disabled={disabled}
        />
      </Group>

      {/* Advanced Options */}
      <Checkbox
        label={t('watermark.settings.convertToImage', 'Flatten PDF pages to images')}
        checked={parameters.convertPDFToImage}
        onChange={(event) => onParameterChange('convertPDFToImage', event.currentTarget.checked)}
        disabled={disabled}
      />
    </Stack>
  );
};

export default WatermarkFormatting;
