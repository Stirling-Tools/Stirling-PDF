import { useTranslation } from "react-i18next";
import ButtonSelector from "@editor/components/shared/ButtonSelector";
import { ExtractImagesParameters } from "@editor/hooks/tools/extractImages/useExtractImagesParameters";

interface ExtractImagesSettingsProps {
  parameters: ExtractImagesParameters;
  onParameterChange: <K extends keyof ExtractImagesParameters>(
    key: K,
    value: ExtractImagesParameters[K],
  ) => void;
  disabled?: boolean;
}

const ExtractImagesSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
}: ExtractImagesSettingsProps) => {
  const { t } = useTranslation();

  return (
    <ButtonSelector<ExtractImagesParameters["format"]>
      label={t("extractImages.selectText", "Image Format")}
      value={parameters.format}
      onChange={(format) => onParameterChange("format", format)}
      options={[
        { value: "png", label: "PNG" },
        { value: "jpg", label: "JPG" },
        { value: "gif", label: "GIF" },
      ]}
      disabled={disabled}
    />
  );
};

export default ExtractImagesSettings;
