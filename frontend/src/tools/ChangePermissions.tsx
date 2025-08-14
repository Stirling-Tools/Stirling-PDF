import { useEffect, useMemo } from "react";
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

import ChangePermissionsSettings from "../components/tools/changePermissions/ChangePermissionsSettings";

import { useChangePermissionsParameters } from "../hooks/tools/changePermissions/useChangePermissionsParameters";
import { useChangePermissionsOperation } from "../hooks/tools/changePermissions/useChangePermissionsOperation";
import { useChangePermissionsTips } from "../components/tooltips/useChangePermissionsTips";
import { BaseToolProps } from "../types/tool";

const ChangePermissions = ({ onPreviewFile, onComplete, onError }: BaseToolProps) => {
  const { t } = useTranslation();
  const { setCurrentMode } = useFileContext();
  const { selectedFiles } = useToolFileSelection();

  const changePermissionsParams = useChangePermissionsParameters();
  const changePermissionsOperation = useChangePermissionsOperation();
  const changePermissionsTips = useChangePermissionsTips();

  // Endpoint validation
  const { enabled: endpointEnabled, loading: endpointLoading } = useEndpointEnabled(changePermissionsParams.getEndpointName());

  useEffect(() => {
    changePermissionsOperation.resetResults();
    onPreviewFile?.(null);
  }, [changePermissionsParams.parameters, selectedFiles]);

  const handleChangePermissions = async () => {
    try {
      await changePermissionsOperation.executeOperation(
        changePermissionsParams.parameters,
        selectedFiles
      );
      if (changePermissionsOperation.files && onComplete) {
        onComplete(changePermissionsOperation.files);
      }
    } catch (error) {
      if (onError) {
        onError(error instanceof Error ? error.message : t('changePermissions.error.failed', 'Change permissions operation failed'));
      }
    }
  };

  const handleThumbnailClick = (file: File) => {
    onPreviewFile?.(file);
    sessionStorage.setItem('previousMode', 'changePermissions');
    setCurrentMode('viewer');
  };

  const handleSettingsReset = () => {
    changePermissionsOperation.resetResults();
    onPreviewFile?.(null);
    setCurrentMode('changePermissions');
  };

  const hasFiles = selectedFiles.length > 0;
  const hasResults = changePermissionsOperation.files.length > 0 || changePermissionsOperation.downloadUrl !== null;
  const filesCollapsed = hasFiles;
  const settingsCollapsed = hasResults;

  const previewResults = useMemo(() =>
    changePermissionsOperation.files?.map((file, index) => ({
      file,
      thumbnail: changePermissionsOperation.thumbnails[index]
    })) || [],
    [changePermissionsOperation.files, changePermissionsOperation.thumbnails]
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

        {/* Settings Step */}
        <ToolStep
          title={t('changePermissions.title', 'Document Permissions')}
          isVisible={hasFiles}
          isCollapsed={settingsCollapsed}
          isCompleted={settingsCollapsed}
          onCollapsedClick={settingsCollapsed ? handleSettingsReset : undefined}
          completedMessage={settingsCollapsed ? t('changePermissions.completed', 'Permissions changed') : undefined}
          tooltip={changePermissionsTips}
        >
          <Stack gap="sm">
            <ChangePermissionsSettings
              parameters={changePermissionsParams.parameters}
              onParameterChange={changePermissionsParams.updateParameter}
              disabled={endpointLoading}
            />

            <OperationButton
              onClick={handleChangePermissions}
              isLoading={changePermissionsOperation.isLoading}
              disabled={!changePermissionsParams.validateParameters() || !hasFiles || !endpointEnabled}
              loadingText={t('loading')}
              submitText={t('changePermissions.submit', 'Change Permissions')}
            />
          </Stack>
        </ToolStep>

        {/* Results Step */}
        <ToolStep
          title={t('results.title', 'Results')}
          isVisible={hasResults}
        >
          <Stack gap="sm">
            {changePermissionsOperation.status && (
              <Text size="sm" c="dimmed">{changePermissionsOperation.status}</Text>
            )}

            <ErrorNotification
              error={changePermissionsOperation.errorMessage}
              onClose={changePermissionsOperation.clearError}
            />

            {changePermissionsOperation.downloadUrl && (
              <Button
                component="a"
                href={changePermissionsOperation.downloadUrl}
                download={changePermissionsOperation.downloadFilename}
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
              isGeneratingThumbnails={changePermissionsOperation.isGeneratingThumbnails}
              title={t('changePermissions.results.title', 'Modified PDFs')}
            />
          </Stack>
        </ToolStep>
      </Stack>
    </ToolStepContainer>
  );
}

export default ChangePermissions;
