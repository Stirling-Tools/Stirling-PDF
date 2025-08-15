import { useEffect, useMemo } from "react";
import { Box, Button, Stack, Text } from "@mantine/core";
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

import RemovePasswordSettings from "../components/tools/removePassword/RemovePasswordSettings";

import { useRemovePasswordParameters } from "../hooks/tools/removePassword/useRemovePasswordParameters";
import { useRemovePasswordOperation } from "../hooks/tools/removePassword/useRemovePasswordOperation";
import { BaseToolProps } from "../types/tool";

const RemovePassword = ({ onPreviewFile, onComplete, onError }: BaseToolProps) => {
  const { t } = useTranslation();
  const { setCurrentMode } = useFileContext();
  const { selectedFiles } = useToolFileSelection();

  const removePasswordParams = useRemovePasswordParameters();
  const removePasswordOperation = useRemovePasswordOperation();

  // Endpoint validation
  const { enabled: endpointEnabled, loading: endpointLoading } = useEndpointEnabled(removePasswordParams.getEndpointName());

  useEffect(() => {
    removePasswordOperation.resetResults();
    onPreviewFile?.(null);
  }, [removePasswordParams.parameters, selectedFiles]);

  const handleRemovePassword = async () => {
    try {
      await removePasswordOperation.executeOperation(
        removePasswordParams.parameters,
        selectedFiles
      );
      if (removePasswordOperation.files && onComplete) {
        onComplete(removePasswordOperation.files);
      }
    } catch (error) {
      if (onError) {
        onError(error instanceof Error ? error.message : t('removePassword.error.failed', 'Remove password operation failed'));
      }
    }
  };

  const handleThumbnailClick = (file: File) => {
    onPreviewFile?.(file);
    sessionStorage.setItem('previousMode', 'removePassword');
    setCurrentMode('viewer');
  };

  const handleSettingsReset = () => {
    removePasswordOperation.resetResults();
    onPreviewFile?.(null);
    setCurrentMode('removePassword');
  };

  const hasFiles = selectedFiles.length > 0;
  const hasResults = removePasswordOperation.files.length > 0 || removePasswordOperation.downloadUrl !== null;
  const filesCollapsed = hasFiles;
  const passwordCollapsed = hasResults;

  const previewResults = useMemo(() =>
    removePasswordOperation.files?.map((file, index) => ({
      file,
      thumbnail: removePasswordOperation.thumbnails[index]
    })) || [],
    [removePasswordOperation.files, removePasswordOperation.thumbnails]
  );

  return (
    <ToolStepContainer>
      <Stack gap="sm" h="94vh" p="sm" style={{ overflow: 'auto' }}>
        {/* Files Step */}
        <ToolStep
          title={t('files.title', 'Files')}
          isVisible={true}
          isCollapsed={filesCollapsed}
          isCompleted={filesCollapsed}
          completedMessage={hasFiles ?
            selectedFiles.length === 1
              ? t('files.selected.single', 'Selected: {{filename}}', { filename: selectedFiles[0].name })
              : t('files.selected.multiple', 'Selected: {{count}} files', { count: selectedFiles.length })
            : undefined}
        >
          <FileStatusIndicator
            selectedFiles={selectedFiles}
            placeholder={t('files.placeholder', 'Select a PDF file in the main view to get started')}
          />
        </ToolStep>

        {/* Password Step */}
        <ToolStep
          title={t('removePassword.title', 'Remove Password')}
          isVisible={hasFiles}
          isCollapsed={passwordCollapsed}
          isCompleted={passwordCollapsed}
          onCollapsedClick={hasResults ? handleSettingsReset : undefined}
          completedMessage={passwordCollapsed ? t('removePassword.password.completed', 'Password configured') : undefined}
        >
          <RemovePasswordSettings
            parameters={removePasswordParams.parameters}
            onParameterChange={removePasswordParams.updateParameter}
            disabled={endpointLoading}
          />
        </ToolStep>

        <Box mt="md">
          <OperationButton
            onClick={handleRemovePassword}
            isLoading={removePasswordOperation.isLoading}
            disabled={!removePasswordParams.validateParameters() || !hasFiles || !endpointEnabled}
            loadingText={t('loading')}
            submitText={t('removePassword.submit', 'Remove Password')}
          />
        </Box>

        {/* Results Step */}
        <ToolStep
          title={t('results.title', 'Results')}
          isVisible={hasResults}
        >
          <Stack gap="sm">
            {removePasswordOperation.status && (
              <Text size="sm" c="dimmed">{removePasswordOperation.status}</Text>
            )}

            <ErrorNotification
              error={removePasswordOperation.errorMessage}
              onClose={removePasswordOperation.clearError}
            />

            {removePasswordOperation.downloadUrl && (
              <Button
                component="a"
                href={removePasswordOperation.downloadUrl}
                download={removePasswordOperation.downloadFilename}
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
              isGeneratingThumbnails={removePasswordOperation.isGeneratingThumbnails}
              title={t('removePassword.results.title', 'Decrypted PDFs')}
            />
          </Stack>
        </ToolStep>
      </Stack>
    </ToolStepContainer>
  );
}

export default RemovePassword;
