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

import CompressSettings from "../components/tools/compress/CompressSettings";

import { useCompressParameters } from "../hooks/tools/compress/useCompressParameters";
import { useCompressOperation } from "../hooks/tools/compress/useCompressOperation";
import { BaseToolProps } from "../types/tool";
import { compressTips } from "../components/tips/COMPRESS_TIPS";

const Compress = ({ onPreviewFile, onComplete, onError }: BaseToolProps) => {
  const { t } = useTranslation();
  const { setCurrentMode } = useFileContext();
  const { selectedFiles } = useToolFileSelection();

  const compressParams = useCompressParameters();
  const compressOperation = useCompressOperation();

  // Endpoint validation
  const { enabled: endpointEnabled, loading: endpointLoading } = useEndpointEnabled("compress-pdf");

  useEffect(() => {
    compressOperation.resetResults();
    onPreviewFile?.(null);
  }, [compressParams.parameters, selectedFiles]);

  const handleCompress = async () => {
    try {
      await compressOperation.executeOperation(
        compressParams.parameters,
        selectedFiles
      );
      if (compressOperation.files && onComplete) {
        onComplete(compressOperation.files);
      }
    } catch (error) {
      if (onError) {
        onError(error instanceof Error ? error.message : 'Compress operation failed');
      }
    }
  };

  const handleThumbnailClick = (file: File) => {
    onPreviewFile?.(file);
    sessionStorage.setItem('previousMode', 'compress');
    setCurrentMode('viewer');
  };

  const handleSettingsReset = () => {
    compressOperation.resetResults();
    onPreviewFile?.(null);
    setCurrentMode('compress');
  };

  const hasFiles = selectedFiles.length > 0;
  const hasResults = compressOperation.files.length > 0 || compressOperation.downloadUrl !== null;
  const filesCollapsed = hasFiles;
  const settingsCollapsed = hasResults;

  const previewResults = useMemo(() =>
    compressOperation.files?.map((file, index) => ({
      file,
      thumbnail: compressOperation.thumbnails[index]
    })) || [],
    [compressOperation.files, compressOperation.thumbnails]
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
          completedMessage={settingsCollapsed ? "Compression completed" : undefined}
          tooltip={compressTips}
        >
          <Stack gap="sm">
            <CompressSettings
              parameters={compressParams.parameters}
              onParameterChange={compressParams.updateParameter}
              disabled={endpointLoading}
            />

            <OperationButton
              onClick={handleCompress}
              isLoading={compressOperation.isLoading}
              disabled={!compressParams.validateParameters() || !hasFiles || !endpointEnabled}
              loadingText={t("loading")}
              submitText="Compress and Review"
            />
          </Stack>
        </ToolStep>

        {/* Results Step */}
        <ToolStep
          title="Results"
          isVisible={hasResults}
        >
          <Stack gap="sm">
            {compressOperation.status && (
              <Text size="sm" c="dimmed">{compressOperation.status}</Text>
            )}

            <ErrorNotification
              error={compressOperation.errorMessage}
              onClose={compressOperation.clearError}
            />

            {compressOperation.downloadUrl && (
              <Button
                component="a"
                href={compressOperation.downloadUrl}
                download={compressOperation.downloadFilename}
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
              isGeneratingThumbnails={compressOperation.isGeneratingThumbnails}
              title="Compression Results"
            />
          </Stack>
        </ToolStep>
      </Stack>
    </ToolStepContainer>
  );
}


export default Compress;
