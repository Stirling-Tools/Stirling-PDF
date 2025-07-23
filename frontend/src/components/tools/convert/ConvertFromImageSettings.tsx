import React from "react";
import { Stack, Text, Select } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { COLOR_TYPES } from "../../../constants/convertConstants";
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
    <Stack gap="sm">
      <Text size="sm" fw={500}>{t("convert.pdfOptions", "PDF Options")}:</Text>
      <Select
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
    </Stack>
  );
};

export default ConvertFromImageSettings;