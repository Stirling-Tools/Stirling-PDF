import { Stack } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { AddWatermarkParameters } from "@app/hooks/tools/addWatermark/useAddWatermarkParameters";
import FileUploadButton from "@app/components/shared/FileUploadButton";

interface WatermarkImageFileProps {
  parameters: AddWatermarkParameters;
  onParameterChange: <K extends keyof AddWatermarkParameters>(key: K, value: AddWatermarkParameters[K]) => void;
  disabled?: boolean;
}

const WatermarkImageFile = ({ parameters, onParameterChange, disabled = false }: WatermarkImageFileProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="sm">
      <FileUploadButton
        file={parameters.watermarkImage}
        onChange={(file) => onParameterChange('watermarkImage', file || undefined)}
        accept="image/*"
        disabled={disabled}
        placeholder={t('watermark.settings.image.choose', 'Choose Image')}
      />
    </Stack>
  );
};

export default WatermarkImageFile;
