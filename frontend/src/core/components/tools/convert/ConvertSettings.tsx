import { useMemo } from "react";
import { Stack, Text, Group, Divider, UnstyledButton, useMantineTheme, useMantineColorScheme } from "@mantine/core";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import { useTranslation } from "react-i18next";
import { useMultipleEndpointsEnabled } from "@app/hooks/useEndpointConfig";
import { isImageFormat, isWebFormat } from "@app/utils/convertUtils";
import { getConversionEndpoints } from "@app/data/toolsTaxonomy";
import { useFileSelection } from "@app/contexts/FileContext";
import { useFileState } from "@app/contexts/FileContext";
import { detectFileExtension } from "@app/utils/fileUtils";
import { usePreferences } from "@app/contexts/PreferencesContext";
import GroupedFormatDropdown from "@app/components/tools/convert/GroupedFormatDropdown";
import ConvertToImageSettings from "@app/components/tools/convert/ConvertToImageSettings";
import ConvertFromImageSettings from "@app/components/tools/convert/ConvertFromImageSettings";
import ConvertFromWebSettings from "@app/components/tools/convert/ConvertFromWebSettings";
import ConvertFromEmailSettings from "@app/components/tools/convert/ConvertFromEmailSettings";
import ConvertFromCbzSettings from "@app/components/tools/convert/ConvertFromCbzSettings";
import ConvertToCbzSettings from "@app/components/tools/convert/ConvertToCbzSettings";
import ConvertToPdfaSettings from "@app/components/tools/convert/ConvertToPdfaSettings";
import ConvertFromCbrSettings from "@app/components/tools/convert/ConvertFromCbrSettings";
import ConvertToCbrSettings from "@app/components/tools/convert/ConvertToCbrSettings";
import ConvertFromEbookSettings from "@app/components/tools/convert/ConvertFromEbookSettings";
import ConvertFromSvgSettings from "@app/components/tools/convert/ConvertFromSvgSettings";
import ConvertToEpubSettings from "@app/components/tools/convert/ConvertToEpubSettings";
import { ConvertParameters } from "@app/hooks/tools/convert/useConvertParameters";
import {
  FROM_FORMAT_OPTIONS,
  EXTENSION_TO_ENDPOINT,
  COLOR_TYPES,
  OUTPUT_OPTIONS,
  FIT_OPTIONS
} from "@app/constants/convertConstants";
import { StirlingFile } from "@app/types/fileContext";

interface ConvertSettingsProps {
  parameters: ConvertParameters;
  onParameterChange: <K extends keyof ConvertParameters>(key: K, value: ConvertParameters[K]) => void;
  getAvailableToExtensions: (fromExtension: string) => Array<{value: string, label: string, group: string}>;
  selectedFiles: StirlingFile[];
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
  const { preferences } = usePreferences();

  const allEndpoints = useMemo(() => {
    const endpoints = getConversionEndpoints(EXTENSION_TO_ENDPOINT);
    return endpoints;
  }, []);

  const { endpointStatus } = useMultipleEndpointsEnabled(allEndpoints);

  const isConversionAvailable = (fromExt: string, toExt: string): boolean => {
    const endpointKey = EXTENSION_TO_ENDPOINT[fromExt]?.[toExt];
    if (!endpointKey) return false;

    const isAvailable = endpointStatus[endpointKey] === true;
    return isAvailable;
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

    // Filter out unavailable source formats if preference is enabled
    let filteredOptions = baseOptions;
    if (preferences.hideUnavailableConversions) {
      filteredOptions = baseOptions.filter(opt => opt.enabled !== false);
    }

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
      return [dynamicOption, ...filteredOptions];
    }

    return filteredOptions;
  }, [parameters.fromExtension, endpointStatus, preferences.hideUnavailableConversions]);

  // Enhanced TO options with endpoint availability
  const enhancedToOptions = useMemo(() => {
    if (!parameters.fromExtension) return [];

    const availableOptions = getAvailableToExtensions(parameters.fromExtension) || [];
    const enhanced = availableOptions.map(option => {
      const enabled = isConversionAvailable(parameters.fromExtension, option.value);
      return {
        ...option,
        enabled
      };
    });

    // Filter out unavailable conversions if preference is enabled
    if (preferences.hideUnavailableConversions) {
      return enhanced.filter(opt => opt.enabled !== false);
    }

    return enhanced;
  }, [parameters.fromExtension, endpointStatus, preferences.hideUnavailableConversions]);

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
    onParameterChange('pdfxOptions', {
      outputFormat: 'pdfx',
    });
    onParameterChange('cbrOptions', {
      optimizeForEbook: false,
    });
    onParameterChange('pdfToCbrOptions', {
      dpi: 150,
    });
    onParameterChange('cbzOptions', {
      optimizeForEbook: false,
    });
    onParameterChange('cbzOutputOptions', {
      dpi: 150,
    });
    onParameterChange('ebookOptions', {
      embedAllFonts: false,
      includeTableOfContents: false,
      includePageNumbers: false,
      optimizeForEbook: false,
    });
    onParameterChange('epubOptions', {
      detectChapters: true,
      targetDevice: 'TABLET_PHONE_IMAGES',
      outputFormat: 'EPUB',
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
    const files = activeFiles.map(fileId => selectors.getFile(fileId)).filter(Boolean) as StirlingFile[];
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

  const updateFileSelection = (files: StirlingFile[]) => {
    const fileIds = files.map(file => file.fileId);
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
    onParameterChange('pdfxOptions', {
      outputFormat: 'pdfx',
    });
    onParameterChange('cbrOptions', {
      optimizeForEbook: false,
    });
    onParameterChange('pdfToCbrOptions', {
      dpi: 150,
    });
    onParameterChange('cbzOptions', {
      optimizeForEbook: false,
    });
    onParameterChange('cbzOutputOptions', {
      dpi: 150,
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

      {/* SVG to PDF options */}
      {parameters.fromExtension === 'svg' && parameters.toExtension === 'pdf' && (
        <>
          <Divider />
          <ConvertFromSvgSettings
            parameters={parameters}
            onParameterChange={onParameterChange}
            disabled={disabled}
          />
        </>
      )}

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

      {/* Email to PDF options (EML and MSG formats) */}
      {(parameters.fromExtension === 'eml' || parameters.fromExtension === 'msg') && parameters.toExtension === 'pdf' && (
        <>
          <Divider />
          <ConvertFromEmailSettings
            parameters={parameters}
            onParameterChange={onParameterChange}
            disabled={disabled}
          />
        </>
      )}

      {/* CBZ to PDF options */}
      {parameters.fromExtension === 'cbz' && parameters.toExtension === 'pdf' && (
        <>
          <Divider />
          <ConvertFromCbzSettings
            parameters={parameters}
            onParameterChange={onParameterChange}
            disabled={disabled}
          />
        </>
      )}

      {/* PDF to CBZ options */}
      {parameters.fromExtension === 'pdf' && parameters.toExtension === 'cbz' && (
        <>
          <Divider />
          <ConvertToCbzSettings
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

      {/* eBook to PDF options */}
      {['epub', 'mobi', 'azw3', 'fb2'].includes(parameters.fromExtension) && parameters.toExtension === 'pdf' && (
        <>
          <Divider />
          <ConvertFromEbookSettings
            parameters={parameters}
            onParameterChange={onParameterChange}
            disabled={disabled}
          />
        </>
      )}

      {/* CBR to PDF options */}
      {parameters.fromExtension === 'cbr' && parameters.toExtension === 'pdf' && (
        <>
          <Divider />
          <ConvertFromCbrSettings
            parameters={parameters}
            onParameterChange={onParameterChange}
            disabled={disabled}
          />
        </>
      )}

      {/* PDF to CBR options */}
      {parameters.fromExtension === 'pdf' && parameters.toExtension === 'cbr' && (
        <>
          <Divider />
          <ConvertToCbrSettings
            parameters={parameters}
            onParameterChange={onParameterChange}
            disabled={disabled}
          />
        </>
      )}

      {/* PDF to EPUB/AZW3 options */}
      {parameters.fromExtension === 'pdf' && ['epub', 'azw3'].includes(parameters.toExtension) && (
        <>
          <Divider />
          <ConvertToEpubSettings
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
