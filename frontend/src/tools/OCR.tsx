import React, { useEffect, useMemo, useState } from "react";
import { Stack, Box } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useEndpointEnabled } from "../hooks/useEndpointConfig";
import { useFileContext } from "../contexts/FileContext";
import { useToolFileSelection } from "../contexts/FileSelectionContext";

import { createToolSteps, ToolStepProvider } from "../components/tools/shared/ToolStep";
import OperationButton from "../components/tools/shared/OperationButton";

import OCRSettings from "../components/tools/ocr/OCRSettings";
import AdvancedOCRSettings from "../components/tools/ocr/AdvancedOCRSettings";

import { useOCRParameters } from "../hooks/tools/ocr/useOCRParameters";
import { useOCROperation } from "../hooks/tools/ocr/useOCROperation";
import { BaseToolProps } from "../types/tool";
import { OcrTips } from "../components/tooltips/OCRTips";

const OCR = ({ onPreviewFile, onComplete, onError }: BaseToolProps) => {
  const { t } = useTranslation();
  const { setCurrentMode } = useFileContext();
  const { selectedFiles } = useToolFileSelection();

  const ocrParams = useOCRParameters();
  const ocrOperation = useOCROperation();
  const ocrTips = OcrTips();

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


  const resultsVisible = hasResults;

  const filesCollapsed = expandedStep !== 'files';
  const settingsCollapsed = expandedStep !== 'settings';


  const steps = createToolSteps();

  return (
    <Stack gap="sm" h="100%" p="sm" style={{ overflow: 'auto' }}>
      <ToolStepProvider>
        {/* Files Step */}
        {steps.createFilesStep({
          selectedFiles,
          isCollapsed: hasFiles && filesCollapsed,
        })}

        {/* Settings Step */}
        {steps.create("Settings", {
          isCollapsed: !hasFiles || settingsCollapsed,
          isCompleted: hasFiles && hasValidSettings,
          onCollapsedClick: () => {
            if (!hasFiles) return; // Only allow if files are selected
            setExpandedStep(expandedStep === 'settings' ? null : 'settings');
          },
          tooltip: ocrTips
        }, (
          <Stack gap="sm">
            <OCRSettings
              parameters={ocrParams.parameters}
              onParameterChange={ocrParams.updateParameter}
              disabled={endpointLoading}
            />
          </Stack>
        ))}

        {/* Advanced Step */}
        {steps.create("Advanced", {
          isCollapsed: expandedStep !== 'advanced',
          isCompleted: hasFiles && hasResults,
          onCollapsedClick: () => {
            if (!hasFiles) return; // Only allow if files are selected
            setExpandedStep(expandedStep === 'advanced' ? null : 'advanced');
          },
        }, (
          <AdvancedOCRSettings
            advancedOptions={ocrParams.parameters.additionalOptions}
            ocrRenderType={ocrParams.parameters.ocrRenderType}
            onParameterChange={ocrParams.updateParameter}
            disabled={endpointLoading}
          />
        ))}

        {/* Process Button - Available after all configuration */}
        {hasValidSettings && !hasResults && (
            <OperationButton
              onClick={handleOCR}
              isLoading={ocrOperation.isLoading}
              disabled={!ocrParams.validateParameters() || !hasFiles || !endpointEnabled}
              loadingText={t("loading")}
              submitText={t("ocr.operation.submit", "Process OCR and Review")}
            />
        )}

        {/* Results Step */}
        {steps.createResultsStep({
          isVisible: resultsVisible,
          operation: ocrOperation,
          title: t("ocr.results.title", "OCR Results"),
          onFileClick: handleThumbnailClick
        })}
      </ToolStepProvider>
    </Stack>
  );
}

export default OCR;
