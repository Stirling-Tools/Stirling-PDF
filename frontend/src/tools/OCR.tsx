import React, { useEffect, useMemo, useState } from "react";
import { Button, Stack, Text, Box } from "@mantine/core";
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
import AdvancedOCRSettings from "../components/tools/ocr/AdvancedOCRSettings";

import { useOCRParameters } from "../hooks/tools/ocr/useOCRParameters";
import { useOCROperation } from "../hooks/tools/ocr/useOCROperation";
import { BaseToolProps } from "../types/tool";

const OCR = ({ onPreviewFile, onComplete, onError }: BaseToolProps) => {
  const { t } = useTranslation();
  const { setCurrentMode } = useFileContext();
  const { selectedFiles } = useToolFileSelection();

  const ocrParams = useOCRParameters();
  const ocrOperation = useOCROperation();

  // Step expansion state management
  const [expandedStep, setExpandedStep] = useState<'files' | 'settings' | 'advanced' | null>('files');

  const { enabled: endpointEnabled, loading: endpointLoading } = useEndpointEnabled("ocr-pdf");

  const hasFiles = selectedFiles.length > 0;
  const hasResults = ocrOperation.files.length > 0 || ocrOperation.downloadUrl !== null;
  const hasValidSettings = ocrParams.validateParameters();

  useEffect(() => {
    ocrOperation.resetResults();
    onPreviewFile?.(null);
  }, [ocrParams.parameters, selectedFiles]);

  useEffect(() => {
    if (selectedFiles.length > 0 && expandedStep === 'files') {
      setExpandedStep('settings');
    }
  }, [selectedFiles.length, expandedStep]);

  // Collapse all steps when results appear
  useEffect(() => {
    if (hasResults) {
      setExpandedStep(null);
    }
  }, [hasResults]);

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


  // Step visibility and collapse logic
  const filesVisible = true;
  const settingsVisible = true;
  const resultsVisible = hasResults;

  const filesCollapsed = expandedStep !== 'files';
  const settingsCollapsed = expandedStep !== 'settings';

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
          isVisible={filesVisible}
          isCollapsed={hasFiles ? filesCollapsed : false}
          isCompleted={hasFiles}
          onCollapsedClick={undefined}
          completedMessage={hasFiles && filesCollapsed ? 
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
          isVisible={settingsVisible}
          isCollapsed={settingsCollapsed}
          isCompleted={hasFiles && hasValidSettings}
          onCollapsedClick={() => {
            if (!hasFiles) return; // Only allow if files are selected
            setExpandedStep(expandedStep === 'settings' ? null : 'settings');
          }}
          completedMessage={hasFiles && hasValidSettings && settingsCollapsed ? "Basic settings configured" : undefined}
        >
          <Stack gap="sm">
            <OCRSettings
              parameters={ocrParams.parameters}
              onParameterChange={ocrParams.updateParameter}
              disabled={endpointLoading}
            />

          </Stack>
        </ToolStep>

        {/* Advanced Step */}
        <ToolStep
          title="Advanced"
          isVisible={true}
          isCollapsed={expandedStep !== 'advanced'}
          isCompleted={hasFiles && hasResults}
          onCollapsedClick={() => {
            if (!hasFiles) return; // Only allow if files are selected
            setExpandedStep(expandedStep === 'advanced' ? null : 'advanced');
          }}
          completedMessage={hasFiles && hasResults && expandedStep !== 'advanced' ? "OCR processing completed" : undefined}
        >
          <AdvancedOCRSettings
            advancedOptions={ocrParams.parameters.additionalOptions}
            ocrRenderType={ocrParams.parameters.ocrRenderType}
            onParameterChange={ocrParams.updateParameter}
            disabled={endpointLoading}
          />
        </ToolStep>

        {/* Process Button - Available after all configuration */}
        {hasValidSettings && !hasResults && (
          <Box mt="md">
            <OperationButton
              onClick={handleOCR}
              isLoading={ocrOperation.isLoading}
              disabled={!ocrParams.validateParameters() || !hasFiles || !endpointEnabled}
              loadingText={t("loading")}
              submitText="Process OCR and Review"
            />
          </Box>
        )}

        {/* Results Step */}
        <ToolStep
          title="Results"
          isVisible={resultsVisible}
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