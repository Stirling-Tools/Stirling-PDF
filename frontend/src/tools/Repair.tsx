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

import { useRepairOperation } from "../hooks/tools/repair/useRepairOperation";
import { BaseToolProps } from "../types/tool";

const Repair = ({ onPreviewFile, onComplete, onError }: BaseToolProps) => {
  const { t } = useTranslation();
  const { setCurrentMode } = useFileContext();
  const { selectedFiles } = useToolFileSelection();

  const repairOperation = useRepairOperation();

  // Endpoint validation
  const { enabled: endpointEnabled, loading: endpointLoading } = useEndpointEnabled("repair");

  useEffect(() => {
    repairOperation.resetResults();
    onPreviewFile?.(null);
  }, [selectedFiles]);

  const handleRepair = async () => {
    try {
      await repairOperation.executeOperation(selectedFiles);
      if (repairOperation.files && onComplete) {
        onComplete(repairOperation.files);
      }
    } catch (error) {
      if (onError) {
        onError(error instanceof Error ? error.message : 'Repair operation failed');
      }
    }
  };

  const handleThumbnailClick = (file: File) => {
    onPreviewFile?.(file);
    sessionStorage.setItem('previousMode', 'repair');
    setCurrentMode('viewer');
  };

  const handleSettingsReset = () => {
    repairOperation.resetResults();
    onPreviewFile?.(null);
    setCurrentMode('repair');
  };

  const hasFiles = selectedFiles.length > 0;
  const hasResults = repairOperation.files.length > 0 || repairOperation.downloadUrl !== null;
  const filesCollapsed = hasFiles;
  const settingsCollapsed = hasResults;

  const previewResults = useMemo(() =>
    repairOperation.files?.map((file, index) => ({
      file,
      thumbnail: repairOperation.thumbnails[index]
    })) || [],
    [repairOperation.files, repairOperation.thumbnails]
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
            placeholder="Select PDF files in the main view to get started"
          />
        </ToolStep>

        {/* Repair Step */}
        <ToolStep
          title="Repair"
          isVisible={hasFiles}
          isCollapsed={settingsCollapsed}
          isCompleted={settingsCollapsed}
          onCollapsedClick={settingsCollapsed ? handleSettingsReset : undefined}
          completedMessage={settingsCollapsed ? "Repair completed" : undefined}
        >
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              This tool attempts to repair corrupted or broken PDF files by fixing structural issues and recovering readable content. Each file is processed individually.
            </Text>

            <OperationButton
              onClick={handleRepair}
              isLoading={repairOperation.isLoading}
              disabled={!hasFiles || !endpointEnabled}
              loadingText={t("loading")}
              submitText={t("repair.submit")}
            />
          </Stack>
        </ToolStep>

        {/* Results Step */}
        <ToolStep
          title="Results"
          isVisible={hasResults}
        >
          <Stack gap="sm">
            {repairOperation.status && (
              <Text size="sm" c="dimmed">{repairOperation.status}</Text>
            )}

            <ErrorNotification
              error={repairOperation.errorMessage}
              onClose={repairOperation.clearError}
            />

            {repairOperation.downloadUrl && (
              <Button
                component="a"
                href={repairOperation.downloadUrl}
                download={repairOperation.downloadFilename}
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
              isGeneratingThumbnails={repairOperation.isGeneratingThumbnails}
              title="Repair Results"
            />
          </Stack>
        </ToolStep>
      </Stack>
    </ToolStepContainer>
  );
}

export default Repair;