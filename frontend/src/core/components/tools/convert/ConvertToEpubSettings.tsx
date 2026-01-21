import { Stack, Select, Checkbox } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ConvertParameters } from "@app/hooks/tools/convert/useConvertParameters";
import { Z_INDEX_AUTOMATE_DROPDOWN } from "@app/styles/zIndex";

interface ConvertToEpubSettingsProps {
  parameters: ConvertParameters;
  onParameterChange: <K extends keyof ConvertParameters>(key: K, value: ConvertParameters[K]) => void;
  disabled?: boolean;
}

const ConvertToEpubSettings = ({
  parameters,
  onParameterChange,
  disabled = false
}: ConvertToEpubSettingsProps) => {
  const { t } = useTranslation();

  const handleDetectChaptersChange = (value: boolean) => {
    onParameterChange('epubOptions', {
      detectChapters: value,
      targetDevice: parameters.epubOptions?.targetDevice ?? 'TABLET_PHONE_IMAGES',
      outputFormat: parameters.epubOptions?.outputFormat ?? parameters.toExtension === 'azw3' ? 'AZW3' : 'EPUB',
    });
  };

  const handleTargetDeviceChange = (value: string | null) => {
    if (value) {
      onParameterChange('epubOptions', {
        detectChapters: parameters.epubOptions?.detectChapters ?? true,
        targetDevice: value,
        outputFormat: parameters.epubOptions?.outputFormat ?? parameters.toExtension === 'azw3' ? 'AZW3' : 'EPUB',
      });
    }
  };

  const handleOutputFormatChange = (value: string | null) => {
    if (value) {
      onParameterChange('epubOptions', {
        detectChapters: parameters.epubOptions?.detectChapters ?? true,
        targetDevice: parameters.epubOptions?.targetDevice ?? 'TABLET_PHONE_IMAGES',
        outputFormat: value,
      });
    }
  };

  // Initialize epubOptions if not present, set output format based on toExtension
  const epubOptions = parameters.epubOptions || {
    detectChapters: true,
    targetDevice: 'TABLET_PHONE_IMAGES',
    outputFormat: parameters.toExtension === 'azw3' ? 'AZW3' : 'EPUB',
  };

  // Sync output format with selected target extension if not manually set
  if (parameters.toExtension === 'azw3' && epubOptions.outputFormat !== 'AZW3') {
    handleOutputFormatChange('AZW3');
  } else if (parameters.toExtension === 'epub' && epubOptions.outputFormat !== 'EPUB') {
    handleOutputFormatChange('EPUB');
  }

  return (
    <Stack gap="sm" data-testid="epub-settings">
      <Checkbox
        label={t("convert.epubOptions.detectChapters", "Detect chapters")}
        description={t("convert.epubOptions.detectChaptersDesc", "Detect headings that look like chapters and insert EPUB page breaks")}
        checked={epubOptions.detectChapters}
        onChange={(event) => handleDetectChaptersChange(event.currentTarget.checked)}
        disabled={disabled}
      />
      
      <Select
        label={t("convert.epubOptions.targetDevice", "Target device")}
        description={t("convert.epubOptions.targetDeviceDesc", "Choose an output profile optimized for the reader device")}
        value={epubOptions.targetDevice}
        onChange={handleTargetDeviceChange}
        disabled={disabled}
        data={[
          { 
            value: 'TABLET_PHONE_IMAGES', 
            label: t("convert.epubOptions.tabletPhone", "Tablet/Phone (with images)") 
          },
          { 
            value: 'KINDLE_EINK_TEXT', 
            label: t("convert.epubOptions.kindleEink", "Kindle e-Ink (text optimized)") 
          }
        ]}
        comboboxProps={{ withinPortal: true, zIndex: Z_INDEX_AUTOMATE_DROPDOWN }}
      />

      <Select
        label={t("convert.epubOptions.outputFormat", "Output format")}
        description={t("convert.epubOptions.outputFormatDesc", "Choose the output format for the ebook")}
        value={epubOptions.outputFormat}
        onChange={handleOutputFormatChange}
        disabled={disabled}
        data={[
          { value: 'EPUB', label: 'EPUB' },
          { value: 'AZW3', label: 'AZW3' }
        ]}
        comboboxProps={{ withinPortal: true, zIndex: Z_INDEX_AUTOMATE_DROPDOWN }}
      />
    </Stack>
  );
};

export default ConvertToEpubSettings;
