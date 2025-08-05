import { useEffect } from "react";
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
import SanitizeSettings from "../components/tools/sanitize/SanitizeSettings";

import { useSanitizeParameters } from "../hooks/tools/sanitize/useSanitizeParameters";
import { useSanitizeOperation } from "../hooks/tools/sanitize/useSanitizeOperation";
import { BaseToolProps } from "../types/tool";

const generateSanitizedFileName = (originalFileName?: string): string => {
  const baseName = originalFileName?.replace(/\.[^/.]+$/, '') || 'document';
  return `${baseName}_sanitized.pdf`;
};

const Sanitize = ({ onPreviewFile, onComplete, onError }: BaseToolProps) => {
  const { t } = useTranslation();
  const { setCurrentMode } = useFileContext();
  const { selectedFiles } = useToolFileSelection();

  const sanitizeParams = useSanitizeParameters();
  const sanitizeOperation = useSanitizeOperation();

  // Endpoint validation
  const { enabled: endpointEnabled, loading: endpointLoading } = useEndpointEnabled(
    sanitizeParams.getEndpointName()
  );

  useEffect(() => {
    sanitizeOperation.resetResults();
    onPreviewFile?.(null);
  }, [sanitizeParams.parameters, selectedFiles]);

  const handleSanitize = async () => {
    try {
      await sanitizeOperation.executeOperation(
        sanitizeParams.parameters,
        selectedFiles
      );
      if (sanitizeOperation.downloadUrl && onComplete) {
        // Create a File object from the download URL for completion callback
        const response = await fetch(sanitizeOperation.downloadUrl);
        const blob = await response.blob();
        const sanitizedFileName = generateSanitizedFileName(selectedFiles[0]?.name);
        const file = new File([blob], sanitizedFileName, {
          type: 'application/pdf'
        });
        onComplete([file]);
      }
    } catch (error) {
      if (onError) {
        onError(error instanceof Error ? error.message : t('sanitize.error.generic', 'Sanitization failed'));
      }
    }
  };

  const handleSettingsReset = () => {
    sanitizeOperation.resetResults();
    onPreviewFile?.(null);
    // JB: Does this need setCurrentMode()?
  };

  const hasFiles = selectedFiles.length > 0;
  const hasResults = sanitizeOperation.downloadUrl !== null;
  const filesCollapsed = hasFiles;
  const settingsCollapsed = hasResults;

  return (
    <ToolStepContainer>
      <Stack gap="sm" h="100%" p="sm" style={{ overflow: 'auto' }}>
        {/* Files Step */}
        <ToolStep
          title={t('sanitize.steps.files', 'Files')}
          isVisible={true}
          isCollapsed={filesCollapsed}
          isCompleted={filesCollapsed}
          completedMessage={hasFiles ? t('sanitize.files.selected', 'Selected: {{filename}}', { filename: selectedFiles[0]?.name }) : undefined}
        >
          <FileStatusIndicator
            selectedFiles={selectedFiles}
            placeholder={t('sanitize.files.placeholder', 'Select a PDF file in the main view to get started')}
          />
        </ToolStep>

        {/* Settings Step */}
        <ToolStep
          title={t('sanitize.steps.settings', 'Settings')}
          isVisible={hasFiles}
          isCollapsed={settingsCollapsed}
          isCompleted={settingsCollapsed}
          onCollapsedClick={settingsCollapsed ? handleSettingsReset : undefined}
          completedMessage={settingsCollapsed ? t('sanitize.completed', 'Sanitization completed') : undefined}
        >
          <Stack gap="sm">
            <SanitizeSettings
              parameters={sanitizeParams.parameters}
              onParameterChange={sanitizeParams.updateParameter}
              disabled={endpointLoading}
            />

            <OperationButton
              onClick={handleSanitize}
              isLoading={sanitizeOperation.isLoading}
              disabled={!sanitizeParams.validateParameters() || !hasFiles || !endpointEnabled}
              loadingText={t("loading")}
              submitText={t("sanitize.submit", "Sanitize PDF")}
            />
          </Stack>
        </ToolStep>

        {/* Results Step */}
        <ToolStep
          title={t('sanitize.steps.results', 'Results')}
          isVisible={hasResults}
        >
          <Stack gap="sm">
            {sanitizeOperation.status && (
              <Text size="sm" c="dimmed">{sanitizeOperation.status}</Text>
            )}

            <ErrorNotification
              error={sanitizeOperation.errorMessage}
              onClose={sanitizeOperation.clearError}
            />

            {sanitizeOperation.downloadUrl && (
              <Button
                component="a"
                href={sanitizeOperation.downloadUrl}
                download={generateSanitizedFileName(selectedFiles[0]?.name)}
                leftSection={<DownloadIcon />}
                color="green"
                fullWidth
                mb="md"
              >
                {t("download", "Download")}
              </Button>
            )}
          </Stack>
        </ToolStep>
      </Stack>
    </ToolStepContainer>
  );
}

export default Sanitize;
