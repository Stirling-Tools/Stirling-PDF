import React, { useState } from "react";
import { Button, Stack, Text, NumberInput, Select } from "@mantine/core";
import { useTranslation } from "react-i18next";

interface CompressParameters {
  compressionMethod: 'quality' | 'filesize';
  compressionLevel: number;
  fileSizeValue: string;
  fileSizeUnit: 'KB' | 'MB';
  grayscale: boolean;
}

interface CompressSettingsProps {
  parameters: CompressParameters;
  onParameterChange: (key: keyof CompressParameters, value: any) => void;
  disabled?: boolean;
}

const CompressSettings = ({ parameters, onParameterChange, disabled = false }: CompressSettingsProps) => {
  const { t } = useTranslation();
  const [isSliding, setIsSliding] = useState(false);

  return (
    <Stack gap="md">
      {/* Compression Method */}
      <Stack gap="sm">
        <Text size="sm" fw={500}>Compression Method</Text>
        <div style={{ display: 'flex', gap: '4px' }}>
          <Button
            variant={parameters.compressionMethod === 'quality' ? 'filled' : 'outline'}
            color={parameters.compressionMethod === 'quality' ? 'blue' : 'gray'}
            onClick={() => onParameterChange('compressionMethod', 'quality')}
            disabled={disabled}
            style={{ flex: 1, height: 'auto', minHeight: '40px', fontSize: '11px' }}
          >
            <div style={{ textAlign: 'center', lineHeight: '1.1', fontSize: '11px' }}>
              Quality
            </div>
          </Button>
          <Button
            variant={parameters.compressionMethod === 'filesize' ? 'filled' : 'outline'}
            color={parameters.compressionMethod === 'filesize' ? 'blue' : 'gray'}
            onClick={() => onParameterChange('compressionMethod', 'filesize')}
            disabled={disabled}
            style={{ flex: 1, height: 'auto', minHeight: '40px', fontSize: '11px' }}
          >
            <div style={{ textAlign: 'center', lineHeight: '1.1', fontSize: '11px' }}>
              File Size
            </div>
          </Button>
        </div>
      </Stack>

      {/* Quality Adjustment */}
      {parameters.compressionMethod === 'quality' && (
        <Stack gap="sm">
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
        <label 
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          title="Converts all images in the PDF to grayscale, which can significantly reduce file size while maintaining readability"
        >
          <input
            type="checkbox"
            checked={parameters.grayscale}
            onChange={(e) => onParameterChange('grayscale', e.target.checked)}
            disabled={disabled}
          />
          <Text size="sm">{t("compress.grayscale.label", "Apply Grayscale for compression")}</Text>
        </label>
      </Stack>
    </Stack>
  );
};

export default CompressSettings;