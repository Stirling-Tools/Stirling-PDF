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

import OCRSettings from "../components/tools/ocr/OCRSettings";

import { useOCRParameters } from "../hooks/tools/ocr/useOCRParameters";
import { useOCROperation } from "../hooks/tools/ocr/useOCROperation";
import { BaseToolProps } from "../types/tool";

const OCR = ({ onPreviewFile, onComplete, onError }: BaseToolProps) => {
  const { t } = useTranslation();
  const { setCurrentMode } = useFileContext();
  const { selectedFiles } = useToolFileSelection();

  const ocrParams = useOCRParameters();
  const ocrOperation = useOCROperation();

  // Endpoint validation
  const { enabled: endpointEnabled, loading: endpointLoading } = useEndpointEnabled("ocr-pdf");

  useEffect(() => {
    ocrOperation.resetResults();
    onPreviewFile?.(null);
  }, [ocrParams.parameters, selectedFiles]);

  const handleOCR = async () => {
    try {
      await ocrOperation.executeOperation(
        ocrParams.parameters,
        selectedFiles
      );
      if (ocrOperation.files && onComplete) {
        onComplete(ocrOperation.files);
      }
    } catch (error) {
      if (onError) {
        onError(error instanceof Error ? error.message : 'OCR operation failed');
      }
    }
  };

  const handleThumbnailClick = (file: File) => {
    onPreviewFile?.(file);
    sessionStorage.setItem('previousMode', 'ocr');
    setCurrentMode('viewer');
  };

  const handleSettingsReset = () => {
    ocrOperation.resetResults();
    onPreviewFile?.(null);
    setCurrentMode('ocr');
  };

  const hasFiles = selectedFiles.length > 0;
  const hasResults = ocrOperation.files.length > 0 || ocrOperation.downloadUrl !== null;
  const filesCollapsed = hasFiles;
  const settingsCollapsed = hasResults;

  const previewResults = useMemo(() =>
    ocrOperation.files?.map((file: File, index: number) => ({
      file,
      thumbnail: ocrOperation.thumbnails[index]
    })) || [],
    [ocrOperation.files, ocrOperation.thumbnails]
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
          completedMessage={hasFiles ?
            selectedFiles.length === 1
              ? `Selected: ${selectedFiles[0].name}`
              : `Selected: ${selectedFiles.length} files`
            : undefined}
        >
          <FileStatusIndicator
            selectedFiles={selectedFiles}
            placeholder="Select a PDF file in the main view to get started"
          />
        </ToolStep>

        {/* Settings Step */}
        <ToolStep
          title="Settings"
          isVisible={hasFiles}
          isCollapsed={settingsCollapsed}
          isCompleted={settingsCollapsed}
          onCollapsedClick={settingsCollapsed ? handleSettingsReset : undefined}
          completedMessage={settingsCollapsed ? "OCR processing completed" : undefined}
        >
          <Stack gap="sm">
            <OCRSettings
              parameters={ocrParams.parameters}
              onParameterChange={ocrParams.updateParameter}
              disabled={endpointLoading}
            />

            <OperationButton
              onClick={handleOCR}
              isLoading={ocrOperation.isLoading}
              disabled={!ocrParams.validateParameters() || !hasFiles || !endpointEnabled}
              loadingText={t("loading")}
              submitText="Process OCR and Review"
            />
          </Stack>
        </ToolStep>

        {/* Results Step */}
        <ToolStep
          title="Results"
          isVisible={hasResults}
        >
          <Stack gap="sm">
            {ocrOperation.status && (
              <Text size="sm" c="dimmed">{ocrOperation.status}</Text>
            )}

            <ErrorNotification
              error={ocrOperation.errorMessage}
              onClose={ocrOperation.clearError}
            />

            {ocrOperation.downloadUrl && (
              <Button
                component="a"
                href={ocrOperation.downloadUrl}
                download={ocrOperation.downloadFilename}
                leftSection={<DownloadIcon />}
                color="green"
                fullWidth
                mb="md"
              >
                {t("download", "Download")}
              </Button>
            )}

            <ResultsPreview
              files={previewResults}
              onFileClick={handleThumbnailClick}
              isGeneratingThumbnails={ocrOperation.isGeneratingThumbnails}
              title="OCR Results"
            />
          </Stack>
        </ToolStep>
      </Stack>
    </ToolStepContainer>
  );
}

export default OCR; 