import { Stack } from "@mantine/core";
import { useTranslation } from "react-i18next";
import ButtonSelector from "../../shared/ButtonSelector";

interface WatermarkTypeSettingsProps {
  watermarkType?: 'text' | 'image';
  onWatermarkTypeChange: (type: 'text' | 'image') => void;
  disabled?: boolean;
}

const WatermarkTypeSettings = ({ watermarkType, onWatermarkTypeChange, disabled = false }: WatermarkTypeSettingsProps) => {
  const { t } = useTranslation();

  const options = [
    {
      value: 'text' as const,
      label: t('watermark.watermarkType.text', 'Text')
    },
    {
      value: 'image' as const,
      label: t('watermark.watermarkType.image', 'Image')
    }
  ];

  return (
    <Stack gap="sm">
      <ButtonSelector
        value={watermarkType}
        onChange={onWatermarkTypeChange}
        options={options}
        disabled={disabled}
      />
    </Stack>
  );
};

export default WatermarkTypeSettings;
