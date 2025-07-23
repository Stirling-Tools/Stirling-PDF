import React, { useMemo } from "react";
import { Stack, Text, Group, Divider, UnstyledButton, useMantineTheme, useMantineColorScheme } from "@mantine/core";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import { useTranslation } from "react-i18next";
import { useMultipleEndpointsEnabled } from "../../../hooks/useEndpointConfig";
import GroupedFormatDropdown from "./GroupedFormatDropdown";
import ConvertToImageSettings from "./ConvertToImageSettings";
import ConvertFromImageSettings from "./ConvertFromImageSettings";
import { ConvertParameters } from "../../../hooks/tools/convert/useConvertParameters";
import { 
  FROM_FORMAT_OPTIONS,
  EXTENSION_TO_ENDPOINT,
  COLOR_TYPES,
  OUTPUT_OPTIONS
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

  // Get all possible conversion endpoints to check their availability
  const allEndpoints = useMemo(() => {
    const endpoints = new Set<string>();
    Object.values(EXTENSION_TO_ENDPOINT).forEach(toEndpoints => {
      Object.values(toEndpoints).forEach(endpoint => {
        endpoints.add(endpoint);
      });
    });
    return Array.from(endpoints);
  }, []);

  const { endpointStatus } = useMultipleEndpointsEnabled(allEndpoints);

  // Function to check if a conversion is available based on endpoint
  const isConversionAvailable = (fromExt: string, toExt: string): boolean => {
    const endpointKey = EXTENSION_TO_ENDPOINT[fromExt]?.[toExt];
    if (!endpointKey) return false;
    
    return endpointStatus[endpointKey] === true;
  };

  // Enhanced FROM options with endpoint availability
  const enhancedFromOptions = useMemo(() => {
    return FROM_FORMAT_OPTIONS.map(option => ({
      ...option,
      enabled: true // All "from" formats are generally available for selection
    }));
  }, []);

  // Enhanced TO options with endpoint availability
  const enhancedToOptions = useMemo(() => {
    if (!parameters.fromExtension) return [];
    
    const availableOptions = getAvailableToExtensions(parameters.fromExtension) || [];
    return availableOptions.map(option => ({
      ...option,
      enabled: isConversionAvailable(parameters.fromExtension, option.value)
    }));
  }, [parameters.fromExtension, getAvailableToExtensions]);

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
          placeholder={t("convert.sourceFormatPlaceholder", "Source format")}
          options={enhancedFromOptions}
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
          placeholder={t("convert.targetFormatPlaceholder", "Target format")}
            options={enhancedToOptions}
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
          <ConvertToImageSettings
            parameters={parameters}
            onParameterChange={onParameterChange}
            disabled={disabled}
          />
        </>
      )}

      
      {/* Color options for image to PDF conversion */}
      {['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'webp'].includes(parameters.fromExtension) && parameters.toExtension === 'pdf' && (
        <>
          <Divider />
          <ConvertFromImageSettings
            parameters={parameters}
            onParameterChange={onParameterChange}
            disabled={disabled}
          />
        </>
      )}
    </Stack>
  );
};

export default ConvertSettings;