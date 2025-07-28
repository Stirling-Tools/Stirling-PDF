import React, { useEffect, useMemo } from "react";
import { Button, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import DownloadIcon from "@mui/icons-material/Download";
import { useEndpointEnabled } from "../hooks/useEndpointConfig";
import { useFileContext } from "../contexts/FileContext";
import { useToolFileSelection } from "../contexts/FileSelectionContext";

import ToolStep, { ToolStepContainer } from "../components/tools/shared/ToolStep";
import OperationButton from "../components/tools/shared/OperationButton";
import ErrorNotification from "../components/tools/shared/ErrorNotification";
import FileStatusIndicator from "../components/tools/shared/FileStatusIndicator";
import ResultsPreview from "../components/tools/shared/ResultsPreview";

import ConvertSettings from "../components/tools/convert/ConvertSettings";

import { useConvertParameters } from "../hooks/tools/convert/useConvertParameters";
import { useConvertOperation } from "../hooks/tools/convert/useConvertOperation";
import { BaseToolProps } from "../types/tool";

const Convert = ({ onPreviewFile, onComplete, onError }: BaseToolProps) => {
  const { t } = useTranslation();
  const { setCurrentMode } = useFileContext();
  const { selectedFiles } = useToolFileSelection();

  const convertParams = useConvertParameters();
  const convertOperation = useConvertOperation();

  // Endpoint validation
  const { enabled: endpointEnabled, loading: endpointLoading } = useEndpointEnabled(
    convertParams.getEndpointName()
  );

  // Auto-detect extension when files change
  useEffect(() => {
    if (selectedFiles.length > 0 && !convertParams.parameters.fromExtension) {
      const firstFile = selectedFiles[0];
      const detectedExtension = convertParams.detectFileExtension(firstFile.name);
      if (detectedExtension) {
        convertParams.updateParameter('fromExtension', detectedExtension);
      }
    }
  }, [selectedFiles, convertParams.parameters.fromExtension]);

  useEffect(() => {
    convertOperation.resetResults();
    onPreviewFile?.(null);
  }, [convertParams.parameters, selectedFiles]);

  const handleConvert = async () => {
    try {
      await convertOperation.executeOperation(
        convertParams.parameters,
        selectedFiles
      );
      if (convertOperation.files && onComplete) {
        onComplete(convertOperation.files);
      }
    } catch (error) {
      if (onError) {
        onError(error instanceof Error ? error.message : 'Convert operation failed');
      }
    }
  };

  const handleThumbnailClick = (file: File) => {
    onPreviewFile?.(file);
    sessionStorage.setItem('previousMode', 'convert');
    setCurrentMode('viewer');
  };

  const handleSettingsReset = () => {
    convertOperation.resetResults();
    onPreviewFile?.(null);
    setCurrentMode('convert');
  };

  const hasFiles = selectedFiles.length > 0;
  const hasResults = convertOperation.downloadUrl !== null;
  const filesCollapsed = hasFiles;
  const settingsCollapsed = hasResults;

  const previewResults = useMemo(() =>
    convertOperation.files?.map((file, index) => ({
      file,
      thumbnail: convertOperation.thumbnails[index]
    })) || [],
    [convertOperation.files, convertOperation.thumbnails]
  );

  return (
    <ToolStepContainer>
      <Stack gap="sm" h="100%" p="sm" style={{ overflow: 'auto' }}>
        {/* Files Step */}
        <ToolStep
          title="Files"
          isVisible={true}
          isCollapsed={filesCollapsed}
          isCompleted={filesCollapsed}
          completedMessage={hasFiles ? `Selected: ${selectedFiles[0]?.name}` : undefined}
        >
          <FileStatusIndicator
            selectedFiles={selectedFiles}
            placeholder="Select a file in the main view to get started"
          />
        </ToolStep>

        {/* Settings Step */}
        <ToolStep
          title="Settings"
          isVisible={hasFiles}
          isCollapsed={settingsCollapsed}
          isCompleted={settingsCollapsed}
          onCollapsedClick={settingsCollapsed ? handleSettingsReset : undefined}
          completedMessage={settingsCollapsed ? "Conversion completed" : undefined}
        >
          <Stack gap="sm">
            <ConvertSettings
              parameters={convertParams.parameters}
              onParameterChange={convertParams.updateParameter}
              getAvailableToExtensions={convertParams.getAvailableToExtensions}
              disabled={endpointLoading}
            />

            {convertParams.parameters.fromExtension && convertParams.parameters.toExtension && (
              <OperationButton
                onClick={handleConvert}
                isLoading={convertOperation.isLoading}
                disabled={!convertParams.validateParameters() || !hasFiles || !endpointEnabled}
                loadingText={t("convert.converting", "Converting...")}
                submitText={t("convert.convertFiles", "Convert Files")}
                data-testid="convert-button"
              />
            )}
          </Stack>
        </ToolStep>

        {/* Results Step */}
        <ToolStep
          title="Results"
          isVisible={hasResults}
          data-testid="conversion-results"
        >
          <Stack gap="sm">
            {convertOperation.status && (
              <Text size="sm" c="dimmed">{convertOperation.status}</Text>
            )}

            <ErrorNotification
              error={convertOperation.errorMessage}
              onClose={convertOperation.clearError}
            />

            {convertOperation.downloadUrl && (
              <Button
                component="a"
                href={convertOperation.downloadUrl}
                download={convertOperation.downloadFilename || "converted_file"}
                leftSection={<DownloadIcon />}
                color="green"
                fullWidth
                mb="md"
                data-testid="download-button"
              >
                {t("convert.downloadConverted", "Download Converted File")}
              </Button>
            )}

            <ResultsPreview
              files={previewResults}
              onFileClick={handleThumbnailClick}
              isGeneratingThumbnails={convertOperation.isGeneratingThumbnails}
              title="Conversion Results"
            />
          </Stack>
        </ToolStep>
      </Stack>
    </ToolStepContainer>
  );
};

export default Convert;
