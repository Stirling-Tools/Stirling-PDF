import React, { useMemo } from "react";
import { Stack, Text, Group, Divider, UnstyledButton, useMantineTheme, useMantineColorScheme } from "@mantine/core";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import { useTranslation } from "react-i18next";
import { useMultipleEndpointsEnabled } from "../../../hooks/useEndpointConfig";
import { isImageFormat, isWebFormat } from "../../../utils/convertUtils";
import { getConversionEndpoints } from "../../../data/toolsTaxonomy";
import { useFileSelection } from "../../../contexts/FileContext";
import { useFileState } from "../../../contexts/FileContext";
import { detectFileExtension } from "../../../utils/fileUtils";
import GroupedFormatDropdown from "./GroupedFormatDropdown";
import ConvertToImageSettings from "./ConvertToImageSettings";
import ConvertFromImageSettings from "./ConvertFromImageSettings";
import ConvertFromWebSettings from "./ConvertFromWebSettings";
import ConvertFromEmailSettings from "./ConvertFromEmailSettings";
import ConvertToPdfaSettings from "./ConvertToPdfaSettings";
import { ConvertParameters } from "../../../hooks/tools/convert/useConvertParameters";
import {
  FROM_FORMAT_OPTIONS,
  EXTENSION_TO_ENDPOINT,
  COLOR_TYPES,
  OUTPUT_OPTIONS,
  FIT_OPTIONS
} from "../../../constants/convertConstants";
import { FileId } from "../../../types/fileContext";

interface ConvertSettingsProps {
  parameters: ConvertParameters;
  onParameterChange: (key: keyof ConvertParameters, value: any) => void;
  getAvailableToExtensions: (fromExtension: string) => Array<{value: string, label: string, group: string}>;
  selectedFiles: File[];
  disabled?: boolean;
}

const ConvertSettings = ({
  parameters,
  onParameterChange,
  getAvailableToExtensions,
  selectedFiles,
  disabled = false
}: ConvertSettingsProps) => {
  const { t } = useTranslation();
  const theme = useMantineTheme();
  const { colorScheme } = useMantineColorScheme();
  const { setSelectedFiles } = useFileSelection();
  const { state, selectors } = useFileState();
  const activeFiles = state.files.ids;

  const allEndpoints = useMemo(() => getConversionEndpoints(EXTENSION_TO_ENDPOINT), []);

  const { endpointStatus } = useMultipleEndpointsEnabled(allEndpoints);

  const isConversionAvailable = (fromExt: string, toExt: string): boolean => {
    const endpointKey = EXTENSION_TO_ENDPOINT[fromExt]?.[toExt];
    if (!endpointKey) return false;

    return endpointStatus[endpointKey] === true;
  };

  // Enhanced FROM options with endpoint availability
  const enhancedFromOptions = useMemo(() => {
    const baseOptions = FROM_FORMAT_OPTIONS.map(option => {
      // Check if this source format has any available conversions
      const availableConversions = getAvailableToExtensions(option.value) || [];
      const hasAvailableConversions = availableConversions.some(targetOption =>
        isConversionAvailable(option.value, targetOption.value)
      );

      return {
        ...option,
        enabled: hasAvailableConversions
      };
    });

    // Add dynamic format option if current selection is a file-<extension> format
    if (parameters.fromExtension && parameters.fromExtension.startsWith('file-')) {
      const extension = parameters.fromExtension.replace('file-', '');
      const dynamicOption = {
        value: parameters.fromExtension,
        label: extension.toUpperCase(),
        group: 'File',
        enabled: true
      };

      // Add the dynamic option at the beginning
      return [dynamicOption, ...baseOptions];
    }

    return baseOptions;
  }, [parameters.fromExtension, endpointStatus]);

  // Enhanced TO options with endpoint availability
  const enhancedToOptions = useMemo(() => {
    if (!parameters.fromExtension) return [];

    const availableOptions = getAvailableToExtensions(parameters.fromExtension) || [];
    return availableOptions.map(option => ({
      ...option,
      enabled: isConversionAvailable(parameters.fromExtension, option.value)
    }));
  }, [parameters.fromExtension, endpointStatus]);

  const resetParametersToDefaults = () => {
    onParameterChange('imageOptions', {
      colorType: COLOR_TYPES.COLOR,
      dpi: 300,
      singleOrMultiple: OUTPUT_OPTIONS.MULTIPLE,
      fitOption: FIT_OPTIONS.MAINTAIN_ASPECT,
      autoRotate: true,
      combineImages: true,
    });
    onParameterChange('emailOptions', {
      includeAttachments: true,
      maxAttachmentSizeMB: 10,
      downloadHtml: false,
      includeAllRecipients: false,
    });
    onParameterChange('pdfaOptions', {
      outputFormat: 'pdfa-1',
    });
    onParameterChange('isSmartDetection', false);
    onParameterChange('smartDetectionType', 'none');
  };

  const setAutoTargetExtension = (fromExtension: string) => {
    const availableToOptions = getAvailableToExtensions(fromExtension);
    const autoTarget = availableToOptions.length === 1 ? availableToOptions[0].value : '';
    onParameterChange('toExtension', autoTarget);
  };

  const filterFilesByExtension = (extension: string) => {
    const files = activeFiles.map(fileId => selectors.getFile(fileId)).filter(Boolean) as File[];
    return files.filter(file => {
      const fileExtension = detectFileExtension(file.name);

      if (extension === 'any') {
        return true;
      } else if (extension === 'image') {
        return isImageFormat(fileExtension);
      } else {
        return fileExtension === extension;
      }
    });
  };

  const updateFileSelection = (files: File[]) => {
    // Map File objects to their actual IDs in FileContext
    const fileIds = files.map(file => {
      // Find the file ID by matching file properties
      const fileRecord = state.files.ids
        .map(id => selectors.getFileRecord(id))
        .find(record =>
          record &&
          record.name === file.name &&
          record.size === file.size &&
          record.lastModified === file.lastModified
        );
      return fileRecord?.id;
    }).filter((id): id is FileId => id !== undefined); // Type guard to ensure only strings

    setSelectedFiles(fileIds);
  };

  const handleFromExtensionChange = (value: string) => {
    onParameterChange('fromExtension', value);
    setAutoTargetExtension(value);
    resetParametersToDefaults();

    if (activeFiles.length > 0) {
      const matchingFiles = filterFilesByExtension(value);
      updateFileSelection(matchingFiles);
    } else {
      updateFileSelection([]);
    }
  };

  const handleToExtensionChange = (value: string) => {
    onParameterChange('toExtension', value);
    onParameterChange('imageOptions', {
      colorType: COLOR_TYPES.COLOR,
      dpi: 300,
      singleOrMultiple: OUTPUT_OPTIONS.MULTIPLE,
      fitOption: FIT_OPTIONS.MAINTAIN_ASPECT,
      autoRotate: true,
      combineImages: true,
    });
    onParameterChange('emailOptions', {
      includeAttachments: true,
      maxAttachmentSizeMB: 10,
      downloadHtml: false,
      includeAllRecipients: false,
    });
    onParameterChange('pdfaOptions', {
      outputFormat: 'pdfa-1',
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
          name="convert-from-dropdown"
          data-testid="convert-from-dropdown"
          value={parameters.fromExtension}
          placeholder={t("convert.sourceFormatPlaceholder", "Source format")}
          options={enhancedFromOptions}
          onChange={handleFromExtensionChange}
          disabled={disabled}
          minWidth="18rem"
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
              <Text size="sm">{t("convert.selectSourceFormatFirst", "Select a source format first")}</Text>
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
            name="convert-to-dropdown"
            data-testid="convert-to-dropdown"
            value={parameters.toExtension}
            placeholder={t("convert.targetFormatPlaceholder", "Target format")}
            options={enhancedToOptions}
            onChange={handleToExtensionChange}
            disabled={disabled}
            minWidth="18rem"
          />
        )}
      </Stack>

      {/* Format-specific options */}
      {isImageFormat(parameters.toExtension) && (
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
      {(isImageFormat(parameters.fromExtension) && parameters.toExtension === 'pdf') ||
       (parameters.isSmartDetection && parameters.smartDetectionType === 'images') ? (
        <>
          <Divider />
          <ConvertFromImageSettings
            parameters={parameters}
            onParameterChange={onParameterChange}
            disabled={disabled}
          />
        </>
      ) : null}

      {/* Web to PDF options */}
      {((isWebFormat(parameters.fromExtension) && parameters.toExtension === 'pdf') ||
       (parameters.isSmartDetection && parameters.smartDetectionType === 'web')) ? (
        <>
          <Divider />
          <ConvertFromWebSettings
            parameters={parameters}
            onParameterChange={onParameterChange}
            disabled={disabled}
          />
        </>
      ) : null}

      {/* Email to PDF options */}
      {parameters.fromExtension === 'eml' && parameters.toExtension === 'pdf' && (
        <>
          <Divider />
          <ConvertFromEmailSettings
            parameters={parameters}
            onParameterChange={onParameterChange}
            disabled={disabled}
          />
        </>
      )}

      {/* PDF to PDF/A options */}
      {parameters.fromExtension === 'pdf' && parameters.toExtension === 'pdfa' && (
        <>
          <Divider />
          <ConvertToPdfaSettings
            parameters={parameters}
            onParameterChange={onParameterChange}
            selectedFiles={selectedFiles}
            disabled={disabled}
          />
        </>
      )}

    </Stack>
  );
};

export default ConvertSettings;
