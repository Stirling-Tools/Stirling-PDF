import React from "react";
import { Stack, Text, Select, NumberInput, Group, Divider, UnstyledButton, useMantineTheme, useMantineColorScheme } from "@mantine/core";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import { useTranslation } from "react-i18next";
import GroupedFormatDropdown from "./GroupedFormatDropdown";
import { ConvertParameters } from "../../../hooks/tools/convert/useConvertParameters";
import { 
  FROM_FORMAT_OPTIONS,
  TO_FORMAT_OPTIONS,
  COLOR_TYPES,
  OUTPUT_OPTIONS,
} from "../../../constants/convertConstants";

interface ConvertSettingsProps {
  parameters: ConvertParameters;
  onParameterChange: (key: keyof ConvertParameters, value: any) => void;
  getAvailableToExtensions: (fromExtension: string) => Array<{value: string, label: string, group: string}>;
  disabled?: boolean;
}

const ConvertSettings = ({ 
  parameters, 
  onParameterChange,
  getAvailableToExtensions,
  disabled = false 
}: ConvertSettingsProps) => {
  const { t } = useTranslation();
  const theme = useMantineTheme();
  const { colorScheme } = useMantineColorScheme();

  const handleFromExtensionChange = (value: string) => {
    onParameterChange('fromExtension', value);
    // Reset to extension when from extension changes
    onParameterChange('toExtension', '');
    // Reset format-specific options
    onParameterChange('imageOptions', {
      colorType: COLOR_TYPES.COLOR,
      dpi: 300,
      singleOrMultiple: OUTPUT_OPTIONS.MULTIPLE,
    });
  };

  const handleToExtensionChange = (value: string) => {
    onParameterChange('toExtension', value);
    // Reset format-specific options when target extension changes
    onParameterChange('imageOptions', {
      colorType: COLOR_TYPES.COLOR,
      dpi: 300,
      singleOrMultiple: OUTPUT_OPTIONS.MULTIPLE,
    });
  };


  return (
    <Stack gap="md">
      {/* Format Selection */}
      <Stack gap="sm">
        <Text size="sm" fw={500}>
          {t("convert.convertFrom", "Convert from")}:
        </Text>
        <GroupedFormatDropdown
          value={parameters.fromExtension}
          placeholder="Select source file format"
          options={FROM_FORMAT_OPTIONS}
          onChange={handleFromExtensionChange}
          disabled={disabled}
          minWidth="21.875rem"
        />
      </Stack>

      <Stack gap="sm">
        <Text size="sm" fw={500}>
          {t("convert.convertTo", "Convert to")}:
        </Text>
        {!parameters.fromExtension ? (
          <UnstyledButton
            style={{
              padding: '0.5rem 0.75rem',
              border: `0.0625rem solid ${theme.colors.gray[4]}`,
              borderRadius: theme.radius.sm,
              backgroundColor: colorScheme === 'dark' ? theme.colors.dark[5] : theme.colors.gray[1],
              color: colorScheme === 'dark' ? theme.colors.dark[2] : theme.colors.gray[6],
              cursor: 'not-allowed'
            }}
          >
            <Group justify="space-between">
              <Text size="sm">Select a source format first</Text>
              <KeyboardArrowDownIcon 
                style={{ 
                  fontSize: '1rem',
                  color: colorScheme === 'dark' ? theme.colors.dark[2] : theme.colors.gray[6]
                }} 
              />
            </Group>
          </UnstyledButton>
        ) : (
          <GroupedFormatDropdown
            value={parameters.toExtension}
            placeholder="Select target file format"
            options={getAvailableToExtensions(parameters.fromExtension) || []}
            onChange={handleToExtensionChange}
            disabled={disabled}
            minWidth="21.875rem"
          />
        )}
      </Stack>

      {/* Format-specific options */}
      {['png', 'jpg'].includes(parameters.toExtension) && (
        <>
          <Divider />
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
        </>
      )}

      
      {/* Color options for image to PDF conversion */}
      {['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'webp'].includes(parameters.fromExtension) && parameters.toExtension === 'pdf' && (
        <>
          <Divider />
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
        </>
      )}
    </Stack>
  );
};

export default ConvertSettings;