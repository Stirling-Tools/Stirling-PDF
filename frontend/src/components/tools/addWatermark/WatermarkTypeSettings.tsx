import React from "react";
import { Button, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";

interface WatermarkTypeSettingsProps {
  parameters: { watermarkType?: 'text' | 'image' };
  onParameterChange: (key: 'watermarkType', value: 'text' | 'image') => void;
  disabled?: boolean;
}

const WatermarkTypeSettings = ({ parameters, onParameterChange, disabled = false }: WatermarkTypeSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="sm">
      <div style={{ display: 'flex', gap: '4px' }}>
        <Button
          variant={parameters.watermarkType === 'text' ? 'filled' : 'outline'}
          color={parameters.watermarkType === 'text' ? 'blue' : 'var(--text-muted)'}
          onClick={() => onParameterChange('watermarkType', 'text')}
          disabled={disabled}
          style={{ flex: 1, height: 'auto', minHeight: '40px', fontSize: '11px' }}
        >
          <div style={{ textAlign: 'center', lineHeight: '1.1', fontSize: '11px' }}>
            {t('watermark.watermarkType.text', 'Text')}
          </div>
        </Button>
        <Button
          variant={parameters.watermarkType === 'image' ? 'filled' : 'outline'}
          color={parameters.watermarkType === 'image' ? 'blue' : 'var(--text-muted)'}
          onClick={() => onParameterChange('watermarkType', 'image')}
          disabled={disabled}
          style={{ flex: 1, height: 'auto', minHeight: '40px', fontSize: '11px' }}
        >
          <div style={{ textAlign: 'center', lineHeight: '1.1', fontSize: '11px' }}>
            {t('watermark.watermarkType.image', 'Image')}
          </div>
        </Button>
      </div>
    </Stack>
  );
};

export default WatermarkTypeSettings;
