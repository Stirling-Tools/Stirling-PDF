import { useEffect, useMemo, useState } from "react";
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

import AddPasswordSettings from "../components/tools/addPassword/AddPasswordSettings";
import ChangePermissionsSettings from "../components/tools/changePermissions/ChangePermissionsSettings";

import { useAddPasswordParameters } from "../hooks/tools/addPassword/useAddPasswordParameters";
import { useAddPasswordOperation } from "../hooks/tools/addPassword/useAddPasswordOperation";
import { useAddPasswordTips } from "../components/tooltips/useAddPasswordTips";
import { BaseToolProps } from "../types/tool";

const AddPassword = ({ onPreviewFile, onComplete, onError }: BaseToolProps) => {
  const { t } = useTranslation();
  const { setCurrentMode } = useFileContext();
  const { selectedFiles } = useToolFileSelection();

  const [expandedPermissions, setExpandedPermissions] = useState(false);

  const addPasswordParams = useAddPasswordParameters();
  const addPasswordOperation = useAddPasswordOperation();
  const addPasswordTips = useAddPasswordTips();

  // Endpoint validation
  const { enabled: endpointEnabled, loading: endpointLoading } = useEndpointEnabled(addPasswordParams.getEndpointName());

  useEffect(() => {
    addPasswordOperation.resetResults();
    onPreviewFile?.(null);
  }, [addPasswordParams.parameters, selectedFiles]);

  const handleAddPassword = async () => {
    try {
      await addPasswordOperation.executeOperation(
        addPasswordParams.fullParameters,
        selectedFiles
      );
      if (addPasswordOperation.files && onComplete) {
        onComplete(addPasswordOperation.files);
      }
    } catch (error) {
      if (onError) {
        onError(error instanceof Error ? error.message : t('addPassword.error.failed', 'Add password operation failed'));
      }
    }
  };

  const handleThumbnailClick = (file: File) => {
    onPreviewFile?.(file);
    sessionStorage.setItem('previousMode', 'addPassword');
    setCurrentMode('viewer');
  };

  const handleSettingsReset = () => {
    addPasswordOperation.resetResults();
    onPreviewFile?.(null);
    setCurrentMode('addPassword');
  };

  const hasFiles = selectedFiles.length > 0;
  const hasResults = addPasswordOperation.files.length > 0 || addPasswordOperation.downloadUrl !== null;
  const filesCollapsed = hasFiles;
  const passwordsCollapsed = hasResults;
  const permissionsCollapsed = expandedPermissions || hasResults;

  const previewResults = useMemo(() =>
    addPasswordOperation.files?.map((file, index) => ({
      file,
      thumbnail: addPasswordOperation.thumbnails[index]
    })) || [],
    [addPasswordOperation.files, addPasswordOperation.thumbnails]
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

        {/* Passwords & Encryption Step */}
        <ToolStep
          title={t('addPassword.passwords.stepTitle', 'Passwords & Encryption')}
          isVisible={hasFiles}
          isCollapsed={passwordsCollapsed}
          isCompleted={passwordsCollapsed}
          onCollapsedClick={hasResults ? handleSettingsReset : undefined}
          completedMessage={passwordsCollapsed ? t('addPassword.passwords.completed', 'Passwords configured') : undefined}
          tooltip={addPasswordTips}
        >
          <AddPasswordSettings
            parameters={addPasswordParams.parameters}
            onParameterChange={addPasswordParams.updateParameter}
            disabled={endpointLoading}
          />
        </ToolStep>

        {/* Permissions Step */}
        <ToolStep
          title={t('addPassword.permissions.stepTitle', 'Document Permissions')}
          isVisible={hasFiles}
          isCollapsed={permissionsCollapsed}
          isCompleted={permissionsCollapsed}
          onCollapsedClick={hasResults ? handleSettingsReset : () => setExpandedPermissions(!expandedPermissions)}
        >
          <ChangePermissionsSettings
            parameters={addPasswordParams.permissions.parameters}
            onParameterChange={addPasswordParams.permissions.updateParameter}
            disabled={endpointLoading}
          />
        </ToolStep>

        <Box mt="md">
          <OperationButton
            onClick={handleAddPassword}
            isLoading={addPasswordOperation.isLoading}
            disabled={!addPasswordParams.validateParameters() || !hasFiles || !endpointEnabled}
            loadingText={t('loading')}
            submitText={t('addPassword.submit', 'Encrypt')}
          />
        </Box>

        {/* Results Step */}
        <ToolStep
          title={t('results.title', 'Results')}
          isVisible={hasResults}
        >
          <Stack gap="sm">
            {addPasswordOperation.status && (
              <Text size="sm" c="dimmed">{addPasswordOperation.status}</Text>
            )}

            <ErrorNotification
              error={addPasswordOperation.errorMessage}
              onClose={addPasswordOperation.clearError}
            />

            {addPasswordOperation.downloadUrl && (
              <Button
                component="a"
                href={addPasswordOperation.downloadUrl}
                download={addPasswordOperation.downloadFilename}
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
              isGeneratingThumbnails={addPasswordOperation.isGeneratingThumbnails}
              title={t('addPassword.results.title', 'Encrypted PDFs')}
            />
          </Stack>
        </ToolStep>
      </Stack>
    </ToolStepContainer>
  );
}

export default AddPassword;
