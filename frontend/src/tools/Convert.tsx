import React, { useEffect, useMemo, useRef } from "react";
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
  const { setCurrentMode, activeFiles } = useFileContext();
  const { selectedFiles } = useToolFileSelection();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const convertParams = useConvertParameters();
  const convertOperation = useConvertOperation();

  const { enabled: endpointEnabled, loading: endpointLoading } = useEndpointEnabled(
    convertParams.getEndpointName()
  );

  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  };

  const hasFiles = selectedFiles.length > 0;
  const hasResults = convertOperation.downloadUrl !== null;
  const filesCollapsed = hasFiles;
  const settingsCollapsed = hasResults;

  useEffect(() => {
    if (selectedFiles.length > 0) {
      convertParams.analyzeFileTypes(selectedFiles);
    } else {
      // Only reset when there are no active files at all
      // If there are active files but no selected files, keep current format (user filtered by format)
      if (activeFiles.length === 0) {
        convertParams.resetParameters();
      }
    }
  }, [selectedFiles, activeFiles]);

  useEffect(() => {
    convertOperation.resetResults();
    onPreviewFile?.(null);
  }, [convertParams.parameters, selectedFiles]);

  useEffect(() => {
    if (hasFiles) {
      setTimeout(scrollToBottom, 100);
    }
  }, [hasFiles]);

  useEffect(() => {
    if (hasResults) {
      setTimeout(scrollToBottom, 100);
    }
  }, [hasResults]);

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

  const previewResults = useMemo(() =>
    convertOperation.files?.map((file, index) => ({
      file,
      thumbnail: convertOperation.thumbnails[index]
    })) || [],
    [convertOperation.files, convertOperation.thumbnails]
  );

  return (
    <div className="h-full max-h-screen overflow-y-auto" ref={scrollContainerRef}>
      <ToolStepContainer>
        <Stack gap="sm" p="sm">
        <ToolStep
          title={t("convert.files", "Files")}
          isVisible={true}
          isCollapsed={filesCollapsed}
          isCompleted={filesCollapsed}
          completedMessage={hasFiles ? `${selectedFiles.length} ${t("filesSelected", "files selected")}` : undefined}
        >
          <FileStatusIndicator
            selectedFiles={selectedFiles}
            placeholder={t("convert.selectFilesPlaceholder", "Select files in the main view to get started")}
          />
        </ToolStep>

        <ToolStep
          title={t("convert.settings", "Settings")}
          isVisible={true}
          isCollapsed={settingsCollapsed}
          isCompleted={settingsCollapsed}
          onCollapsedClick={settingsCollapsed ? handleSettingsReset : undefined}
          completedMessage={settingsCollapsed ? t("convert.conversionCompleted", "Conversion completed") : undefined}
        >
          <Stack gap="sm">
            <ConvertSettings
              parameters={convertParams.parameters}
              onParameterChange={convertParams.updateParameter}
              getAvailableToExtensions={convertParams.getAvailableToExtensions}
              selectedFiles={selectedFiles}
              disabled={endpointLoading}
            />

            {hasFiles && convertParams.parameters.fromExtension && convertParams.parameters.toExtension && (
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

        <ToolStep
          title={t("convert.results", "Results")}
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
                download={convertOperation.downloadFilename || t("convert.defaultFilename", "converted_file")}
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
              title={t("convert.conversionResults", "Conversion Results")}
            />
          </Stack>
        </ToolStep>
        </Stack>
      </ToolStepContainer>
    </div>
  );
};

export default Convert;
