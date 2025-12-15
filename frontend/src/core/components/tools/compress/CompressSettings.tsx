import { useState, useEffect } from "react";
import { Stack, Text, NumberInput, Select, Divider, Checkbox, Slider, SegmentedControl } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { CompressParameters } from "@app/hooks/tools/compress/useCompressParameters";
import ButtonSelector from "@app/components/shared/ButtonSelector";
import apiClient from "@app/services/apiClient";

interface CompressSettingsProps {
  parameters: CompressParameters;
  onParameterChange: <K extends keyof CompressParameters>(key: K, value: CompressParameters[K]) => void;
  disabled?: boolean;
}

const CompressSettings = ({ parameters, onParameterChange, disabled = false }: CompressSettingsProps) => {
  const { t } = useTranslation();
  const [isSliding, setIsSliding] = useState(false);
  const [imageMagickAvailable, setImageMagickAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    const checkImageMagick = async () => {
      try {
        const response = await apiClient.get<boolean>('/api/v1/config/group-enabled?group=ImageMagick');
        setImageMagickAvailable(response.data);
      } catch (error) {
        console.error('Failed to check ImageMagick availability:', error);
        setImageMagickAvailable(true); // Optimistic fallback
      }
    };
    checkImageMagick();
  }, []);

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
        <Stack gap="sm">
          <Divider />
          <Text size="sm" fw={500}>Compression Level</Text>
          <div style={{ position: 'relative' }}>
            <input
              type="range"
              min="1"
              max="9"
              step="1"
              value={parameters.compressionLevel}
              onChange={(e) => onParameterChange('compressionLevel', parseInt(e.target.value))}
              onMouseDown={() => setIsSliding(true)}
              onMouseUp={() => setIsSliding(false)}
              onTouchStart={() => setIsSliding(true)}
              onTouchEnd={() => setIsSliding(false)}
              disabled={disabled}
              style={{
                width: '100%',
                height: '6px',
                borderRadius: '3px',
                background: `linear-gradient(to right, #228be6 0%, #228be6 ${(parameters.compressionLevel - 1) / 8 * 100}%, #e9ecef ${(parameters.compressionLevel - 1) / 8 * 100}%, #e9ecef 100%)`,
                outline: 'none',
                WebkitAppearance: 'none'
              }}
            />
            {isSliding && (
              <div style={{
                position: 'absolute',
                top: '-25px',
                left: `${(parameters.compressionLevel - 1) / 8 * 100}%`,
                transform: 'translateX(-50%)',
                background: '#f8f9fa',
                border: '1px solid #dee2e6',
                borderRadius: '4px',
                padding: '2px 6px',
                fontSize: '12px',
                color: '#228be6',
                whiteSpace: 'nowrap'
              }}>
                {parameters.compressionLevel}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#6c757d' }}>
            <span>Min 1</span>
            <span>Max 9</span>
          </div>
          <Text size="xs" c="dimmed" style={{ marginTop: '8px' }}>
            {parameters.compressionLevel <= 3 && "1-3 PDF compression"}
            {parameters.compressionLevel >= 4 && parameters.compressionLevel <= 6 && "4-6 lite image compression"}
            {parameters.compressionLevel >= 7 && "7-9 intense image compression Will dramatically reduce image quality"}
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
        <Checkbox
          checked={parameters.lineArt}
          onChange={(event) => onParameterChange('lineArt', event.currentTarget.checked)}
          disabled={disabled || imageMagickAvailable === false}
          label={t("compress.lineArt.label", "Convert images to line art (bilevel)")}
          description={
            imageMagickAvailable === false
              ? t("compress.lineArt.unavailable", "ImageMagick is not installed or enabled on this server")
              : t("compress.lineArt.description", "Uses ImageMagick to reduce pages to high-contrast black and white for maximum size reduction.")
          }
        />
        {parameters.lineArt && (
          <Stack gap="xs" style={{ opacity: (disabled || imageMagickAvailable === false) ? 0.6 : 1 }}>
            <Text size="sm" fw={600}>{t('compress.lineArt.detailLevel', 'Detail level')}</Text>
            <Slider
              min={1}
              max={5}
              step={1}
              value={(() => {
                // Map threshold to slider position
                const thresholdMap = [20, 35, 50, 65, 80];
                const closest = thresholdMap.reduce((prev, curr, idx) =>
                  Math.abs(curr - parameters.lineArtThreshold) < Math.abs(thresholdMap[prev] - parameters.lineArtThreshold)
                    ? idx : prev, 0);
                return closest + 1;
              })()}
              onChange={(value) => {
                // Map slider position to threshold: 1=20%, 2=35%, 3=50%, 4=65%, 5=80%
                const thresholdMap = [20, 35, 50, 65, 80];
                onParameterChange('lineArtThreshold', thresholdMap[value - 1]);
              }}
              disabled={disabled || imageMagickAvailable === false}
              label={null}
              marks={[
                { value: 1 },
                { value: 2 },
                { value: 3 },
                { value: 4 },
                { value: 5 },
              ]}
            />

            <Text size="sm" fw={600}>{t('compress.lineArt.edgeEmphasis', 'Edge emphasis')}</Text>
            <SegmentedControl
              fullWidth
              disabled={disabled || imageMagickAvailable === false}
              data={[
                { value: '1', label: t('compress.lineArt.edgeLow', 'Gentle') },
                { value: '2', label: t('compress.lineArt.edgeMedium', 'Balanced') },
                { value: '3', label: t('compress.lineArt.edgeHigh', 'Strong') },
              ]}
              value={parameters.lineArtEdgeLevel.toString()}
              onChange={(value) => onParameterChange('lineArtEdgeLevel', parseInt(value) as 1 | 2 | 3)}
            />
          </Stack>
        )}
      </Stack>
    </Stack>
  );
};

export default CompressSettings;
