import { Stack, Text, NumberInput, Select, Divider, Checkbox } from "@mantine/core";
import SliderWithInput from '@app/components/shared/sliderWithInput/SliderWithInput';
import { useTranslation } from "react-i18next";
import { CompressParameters } from "@app/hooks/tools/compress/useCompressParameters";
import ButtonSelector from "@app/components/shared/ButtonSelector";

interface CompressSettingsProps {
  parameters: CompressParameters;
  onParameterChange: <K extends keyof CompressParameters>(key: K, value: CompressParameters[K]) => void;
  disabled?: boolean;
}

const CompressSettings = ({ parameters, onParameterChange, disabled = false }: CompressSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="md">

      <Divider ml='-md'></Divider>
      {/* Compression Method */}
      <ButtonSelector
        label={t('compress.method.title', 'Compression Method')}
        value={parameters.compressionMethod}
        onChange={(value) => onParameterChange('compressionMethod', value)}
        options={[
          { value: 'quality', label: t('compress.method.quality', 'Quality') },
          { value: 'filesize', label: t('compress.method.filesize', 'File Size') },
        ]}
        disabled={disabled}
      />

      {/* Quality Adjustment */}
      {parameters.compressionMethod === 'quality' && (
        <Stack gap="md">
          <Divider />
          <SliderWithInput
            label={t('compress.tooltip.qualityAdjustment.title', 'Compression Level')}
            value={parameters.compressionLevel}
            onChange={(value) => onParameterChange('compressionLevel', value)}
            disabled={disabled}
            min={1}
            max={9}
            step={1}
            suffix=""
          />
          <Text size="xs" c="dimmed" mt={-4}>
            {parameters.compressionLevel <= 3 && t('compress.compressionLevel.range1to3', 'Lower values preserve quality but result in larger files')}
            {parameters.compressionLevel >= 4 && parameters.compressionLevel <= 6 && t('compress.compressionLevel.range4to6', 'Medium compression with moderate quality reduction')}
            {parameters.compressionLevel >= 7 && t('compress.compressionLevel.range7to9', 'Higher values reduce file size significantly but may reduce image clarity')}
          </Text>
        </Stack>
      )}

      <Divider/>

      {/* File Size Input */}
      {parameters.compressionMethod === 'filesize' && (
        <Stack gap="sm">
          <Text size="sm" fw={500}>Desired File Size</Text>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
            <NumberInput
              placeholder="Enter size"
              value={parameters.fileSizeValue}
              onChange={(value) => onParameterChange('fileSizeValue', value?.toString() || '')}
              min={0}
              disabled={disabled}
              style={{ flex: 1 }}
            />
            <Select
              value={parameters.fileSizeUnit}
              onChange={(value) => {
                // Prevent deselection - if value is null/undefined, keep the current value
                if (value) {
                  onParameterChange('fileSizeUnit', value as 'KB' | 'MB');
                }
              }}
              disabled={disabled}
              data={[
                { value: 'KB', label: 'KB' },
                { value: 'MB', label: 'MB' }
              ]}
              style={{ width: '80px' }}
            />
          </div>
        </Stack>
      )}

      {/* Compression Options */}
      <Stack gap="sm">
        <Checkbox
          checked={parameters.grayscale}
          onChange={(event) => onParameterChange('grayscale', event.currentTarget.checked)}
          disabled={disabled}
          label={t("compress.grayscale.label", "Apply Grayscale for compression")}
        />
      </Stack>
    </Stack>
  );
};

export default CompressSettings;
