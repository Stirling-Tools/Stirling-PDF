import { useTranslation } from "react-i18next";
import ButtonSelector from "@app/components/shared/ButtonSelector";

interface WatermarkTypeSettingsProps {
  watermarkType?: 'text' | 'image';
  onWatermarkTypeChange: (type: 'text' | 'image') => void;
  disabled?: boolean;
}

const WatermarkTypeSettings = ({ watermarkType, onWatermarkTypeChange, disabled = false }: WatermarkTypeSettingsProps) => {
  const { t } = useTranslation();

  return (
    <ButtonSelector
      value={watermarkType}
      onChange={onWatermarkTypeChange}
      options={[
        {
          value: 'text',
          label: t('watermark.watermarkType.text', 'Text'),
        },
        {
          value: 'image',
          label: t('watermark.watermarkType.image', 'Image'),
        },
      ]}
      disabled={disabled}
    />
  );
};

export default WatermarkTypeSettings;
