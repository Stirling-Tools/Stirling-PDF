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
import SplitSettings from "../components/tools/split/SplitSettings";

import { useSplitParameters } from "../hooks/tools/split/useSplitParameters";
import { useSplitOperation } from "../hooks/tools/split/useSplitOperation";
import { BaseToolProps } from "../types/tool";

const Split = ({ onPreviewFile, onComplete, onError }: BaseToolProps) => {
  const { t } = useTranslation();
  const { setCurrentMode } = useFileContext();
  const { selectedFiles } = useToolFileSelection();

  const splitParams = useSplitParameters();
  const splitOperation = useSplitOperation();

  // Endpoint validation
  const { enabled: endpointEnabled, loading: endpointLoading } = useEndpointEnabled(
    splitParams.getEndpointName()
  );

  useEffect(() => {
    splitOperation.resetResults();
    onPreviewFile?.(null);
  }, [splitParams.mode, splitParams.parameters, selectedFiles]);

  const handleSplit = async () => {
    try {
      await splitOperation.executeOperation(
        splitParams.mode,
        splitParams.parameters,
        selectedFiles
      );
      if (splitOperation.files && onComplete) {
        onComplete(splitOperation.files);
      }
    } catch (error) {
      if (onError) {
        onError(error instanceof Error ? error.message : 'Split operation failed');
      }
    }
  };

  const handleThumbnailClick = (file: File) => {
    onPreviewFile?.(file);
    sessionStorage.setItem('previousMode', 'split');
    setCurrentMode('viewer');
  };

  const handleSettingsReset = () => {
    splitOperation.resetResults();
    onPreviewFile?.(null);
    setCurrentMode('split');
  };

  const hasFiles = selectedFiles.length > 0;
  const hasResults = splitOperation.downloadUrl !== null;
  const filesCollapsed = hasFiles;
  const settingsCollapsed = hasResults;

  const previewResults = useMemo(() =>
    splitOperation.files?.map((file, index) => ({
      file,
      thumbnail: splitOperation.thumbnails[index]
    })) || [],
    [splitOperation.files, splitOperation.thumbnails]
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
          completedMessage={settingsCollapsed ? "Split completed" : undefined}
        >
          <Stack gap="sm">
            <SplitSettings
              mode={splitParams.mode}
              onModeChange={splitParams.setMode}
              parameters={splitParams.parameters}
              onParameterChange={splitParams.updateParameter}
              disabled={endpointLoading}
            />

            {splitParams.mode && (
              <OperationButton
                onClick={handleSplit}
                isLoading={splitOperation.isLoading}
                disabled={!splitParams.validateParameters() || !hasFiles || !endpointEnabled}
                loadingText={t("loading")}
                submitText={t("split.submit", "Split PDF")}
              />
            )}
          </Stack>
        </ToolStep>

        {/* Results Step */}
        <ToolStep
          title="Results"
          isVisible={hasResults}
        >
          <Stack gap="sm">
            {splitOperation.status && (
              <Text size="sm" c="dimmed">{splitOperation.status}</Text>
            )}

            <ErrorNotification
              error={splitOperation.errorMessage}
              onClose={splitOperation.clearError}
            />

            {splitOperation.downloadUrl && (
              <Button
                component="a"
                href={splitOperation.downloadUrl}
                download="split_output.zip"
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
              isGeneratingThumbnails={splitOperation.isGeneratingThumbnails}
              title="Split Results"
            />
          </Stack>
        </ToolStep>
      </Stack>
    </ToolStepContainer>
  );
}

export default Split;
