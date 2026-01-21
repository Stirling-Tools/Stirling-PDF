import { Stack, Text, Select, NumberInput, Group } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { COLOR_TYPES, OUTPUT_OPTIONS } from "@app/constants/convertConstants";
import { ConvertParameters } from "@app/hooks/tools/convert/useConvertParameters";
import { Z_INDEX_AUTOMATE_DROPDOWN } from "@app/styles/zIndex";

interface ConvertToImageSettingsProps {
  parameters: ConvertParameters;
  onParameterChange: <K extends keyof ConvertParameters>(key: K, value: ConvertParameters[K]) => void;
  disabled?: boolean;
}

const ConvertToImageSettings = ({
  parameters,
  onParameterChange,
  disabled = false
}: ConvertToImageSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="sm" data-testid="image-options-section">
      <Text size="sm" fw={500} data-testid="image-options-title">{t("convert.imageOptions", "Image Options")}:</Text>
      <Group grow>
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
            { value: COLOR_TYPES.GRAYSCALE, label: t("convert.grayscale", "Grayscale") },
            { value: COLOR_TYPES.BLACK_WHITE, label: t("convert.blackwhite", "Black & White") },
          ]}
          disabled={disabled}
          comboboxProps={{ withinPortal: true, zIndex: Z_INDEX_AUTOMATE_DROPDOWN }}
        />
        <NumberInput
          data-testid="dpi-input"
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
        data-testid="output-type-select"
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
        comboboxProps={{ withinPortal: true, zIndex: Z_INDEX_AUTOMATE_DROPDOWN }}
      />
    </Stack>
  );
};

export default ConvertToImageSettings;
