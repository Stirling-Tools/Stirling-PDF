import { Button, Stack } from "@mantine/core";
import { useTranslation } from "react-i18next";

interface WatermarkTypeSettingsProps {
  watermarkType?: 'text' | 'image';
  onWatermarkTypeChange: (type: 'text' | 'image') => void;
  disabled?: boolean;
}

const WatermarkTypeSettings = ({ watermarkType, onWatermarkTypeChange, disabled = false }: WatermarkTypeSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="sm">
      <div style={{ display: 'flex', gap: '4px' }}>
        <Button
          variant={watermarkType === 'text' ? 'filled' : 'outline'}
          color={watermarkType === 'text' ? 'blue' : 'var(--text-muted)'}
          onClick={() => onWatermarkTypeChange('text')}
          disabled={disabled}
          style={{ flex: 1, height: 'auto', minHeight: '40px', fontSize: '11px' }}
        >
          <div style={{ textAlign: 'center', lineHeight: '1.1', fontSize: '11px' }}>
            {t('watermark.watermarkType.text', 'Text')}
          </div>
        </Button>
        <Button
          variant={watermarkType === 'image' ? 'filled' : 'outline'}
          color={watermarkType === 'image' ? 'blue' : 'var(--text-muted)'}
          onClick={() => onWatermarkTypeChange('image')}
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
