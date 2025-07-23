import React from "react";
import { Stack, Text, Select, NumberInput, Group } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { COLOR_TYPES, OUTPUT_OPTIONS } from "../../../constants/convertConstants";
import { ConvertParameters } from "../../../hooks/tools/convert/useConvertParameters";

interface ConvertToImageSettingsProps {
  parameters: ConvertParameters;
  onParameterChange: (key: keyof ConvertParameters, value: any) => void;
  disabled?: boolean;
}

const ConvertToImageSettings = ({
  parameters,
  onParameterChange,
  disabled = false
}: ConvertToImageSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="sm">
      <Text size="sm" fw={500}>{t("convert.imageOptions", "Image Options")}:</Text>
      <Group grow>
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
        <NumberInput
          label={t("convert.dpi", "DPI")}
          value={parameters.imageOptions.dpi}
          onChange={(val) => typeof val === 'number' && onParameterChange('imageOptions', {
            ...parameters.imageOptions,
            dpi: val
          })}
          min={72}
          max={600}
          step={1}
          disabled={disabled}
        />
      </Group>
      <Select
        label={t("convert.output", "Output")}
        value={parameters.imageOptions.singleOrMultiple}
        onChange={(val) => val && onParameterChange('imageOptions', {
          ...parameters.imageOptions,
          singleOrMultiple: val as typeof OUTPUT_OPTIONS[keyof typeof OUTPUT_OPTIONS]
        })}
        data={[
          { value: OUTPUT_OPTIONS.SINGLE, label: t("convert.single", "Single") },
          { value: OUTPUT_OPTIONS.MULTIPLE, label: t("convert.multiple", "Multiple") },
        ]}
        disabled={disabled}
      />
    </Stack>
  );
};

export default ConvertToImageSettings;