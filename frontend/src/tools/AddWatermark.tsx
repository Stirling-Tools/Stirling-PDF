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

import AddWatermarkSettings from "../components/tools/addWatermark/AddWatermarkSettings";

import { useAddWatermarkParameters } from "../hooks/tools/addWatermark/useAddWatermarkParameters";
import { useAddWatermarkOperation } from "../hooks/tools/addWatermark/useAddWatermarkOperation";
import { BaseToolProps } from "../types/tool";

const AddWatermark = ({ onPreviewFile, onComplete, onError }: BaseToolProps) => {
  const { t } = useTranslation();
  const { setCurrentMode } = useFileContext();
  const { selectedFiles } = useToolFileSelection();

  const watermarkParams = useAddWatermarkParameters();
  const watermarkOperation = useAddWatermarkOperation();

  // Endpoint validation
  const { enabled: endpointEnabled, loading: endpointLoading } = useEndpointEnabled("add-watermark");

  useEffect(() => {
    watermarkOperation.resetResults();
    onPreviewFile?.(null);
  }, [watermarkParams.parameters, selectedFiles]);

  const handleAddWatermark = async () => {
    try {
      await watermarkOperation.executeOperation(
        watermarkParams.parameters,
        selectedFiles
      );
      if (watermarkOperation.files && onComplete) {
        onComplete(watermarkOperation.files);
      }
    } catch (error) {
      if (onError) {
        onError(error instanceof Error ? error.message : 'Add watermark operation failed');
      }
    }
  };

  const handleThumbnailClick = (file: File) => {
    onPreviewFile?.(file);
    sessionStorage.setItem('previousMode', 'watermark');
    setCurrentMode('viewer');
  };

  const handleSettingsReset = () => {
    watermarkOperation.resetResults();
    onPreviewFile?.(null);
    setCurrentMode('watermark');
  };

  const hasFiles = selectedFiles.length > 0;
  const hasResults = watermarkOperation.files.length > 0 || watermarkOperation.downloadUrl !== null;
  const filesCollapsed = hasFiles;
  const settingsCollapsed = hasResults;

  const previewResults = useMemo(() =>
    watermarkOperation.files?.map((file, index) => ({
      file,
      thumbnail: watermarkOperation.thumbnails[index]
    })) || [],
    [watermarkOperation.files, watermarkOperation.thumbnails]
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
          completedMessage={settingsCollapsed ? "Watermark added" : undefined}
        >
          <Stack gap="sm">
            <AddWatermarkSettings
              parameters={watermarkParams.parameters}
              onParameterChange={watermarkParams.updateParameter}
              disabled={endpointLoading}
            />

            <OperationButton
              onClick={handleAddWatermark}
              isLoading={watermarkOperation.isLoading}
              disabled={!watermarkParams.validateParameters() || !hasFiles || !endpointEnabled}
              loadingText={t("loading")}
              submitText="Add Watermark and Review"
            />
          </Stack>
        </ToolStep>

        {/* Results Step */}
        <ToolStep
          title="Results"
          isVisible={hasResults}
        >
          <Stack gap="sm">
            {watermarkOperation.status && (
              <Text size="sm" c="dimmed">{watermarkOperation.status}</Text>
            )}

            <ErrorNotification
              error={watermarkOperation.errorMessage}
              onClose={watermarkOperation.clearError}
            />

            {watermarkOperation.downloadUrl && (
              <Button
                component="a"
                href={watermarkOperation.downloadUrl}
                download={watermarkOperation.downloadFilename}
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
              isGeneratingThumbnails={watermarkOperation.isGeneratingThumbnails}
              title="Watermark Results"
            />
          </Stack>
        </ToolStep>
      </Stack>
    </ToolStepContainer>
  );
}

export default AddWatermark;