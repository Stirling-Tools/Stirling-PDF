import React from "react";
import { Stack, Text, Select, Switch } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { COLOR_TYPES, FIT_OPTIONS } from "../../../constants/convertConstants";
import { ConvertParameters } from "../../../hooks/tools/convert/useConvertParameters";

interface ConvertFromImageSettingsProps {
  parameters: ConvertParameters;
  onParameterChange: (key: keyof ConvertParameters, value: any) => void;
  disabled?: boolean;
}

const ConvertFromImageSettings = ({
  parameters,
  onParameterChange,
  disabled = false
}: ConvertFromImageSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="sm" data-testid="pdf-options-section">
      <Text size="sm" fw={500}>{t("convert.pdfOptions", "PDF Options")}:</Text>
      <Select
        data-testid="color-type-select"
        label={t("convert.colorType", "Color Type")}
        value={parameters.imageOptions.colorType}
        onChange={(val) => val && onParameterChange('imageOptions', {
          ...parameters.imageOptions,
          colorType: val as typeof COLOR_TYPES[keyof typeof COLOR_TYPES]
        })}
        data={[
          { value: COLOR_TYPES.COLOR, label: t("convert.color", "Color") },
          { value: COLOR_TYPES.GREYSCALE, label: t("convert.greyscale", "Greyscale") },
          { value: COLOR_TYPES.BLACK_WHITE, label: t("convert.blackwhite", "Black & White") },
        ]}
        disabled={disabled}
      />
      
      <Select
        data-testid="fit-option-select"
        label={t("convert.fitOption", "Fit Option")}
        value={parameters.imageOptions.fitOption}
        onChange={(val) => val && onParameterChange('imageOptions', {
          ...parameters.imageOptions,
          fitOption: val as typeof FIT_OPTIONS[keyof typeof FIT_OPTIONS]
        })}
        data={[
          { value: FIT_OPTIONS.MAINTAIN_ASPECT, label: t("convert.maintainAspectRatio", "Maintain Aspect Ratio") },
          { value: FIT_OPTIONS.FIT_PAGE, label: t("convert.fitDocumentToPage", "Fit Document to Page") },
          { value: FIT_OPTIONS.FILL_PAGE, label: t("convert.fillPage", "Fill Page") },
        ]}
        disabled={disabled}
      />
      
      <Switch
        data-testid="auto-rotate-switch"
        label={t("convert.autoRotate", "Auto Rotate")}
        description={t("convert.autoRotateDescription", "Automatically rotate images to better fit the PDF page")}
        checked={parameters.imageOptions.autoRotate}
        onChange={(event) => onParameterChange('imageOptions', {
          ...parameters.imageOptions,
          autoRotate: event.currentTarget.checked
        })}
        disabled={disabled}
      />
      
      <Switch
        data-testid="combine-images-switch"
        label={t("convert.combineImages", "Combine Images")}
        description={t("convert.combineImagesDescription", "Combine all images into one PDF, or create separate PDFs for each image")}
        checked={parameters.imageOptions.combineImages}
        onChange={(event) => onParameterChange('imageOptions', {
          ...parameters.imageOptions,
          combineImages: event.currentTarget.checked
        })}
        disabled={disabled}
      />
    </Stack>
  );
};

export default ConvertFromImageSettings;