import React, { useEffect, useState } from "react";
import { Stack } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useEndpointEnabled } from "../hooks/useEndpointConfig";
import { useFileContext } from "../contexts/FileContext";
import { useToolFileSelection } from "../contexts/FileSelectionContext";

import { createToolFlow } from "../components/tools/shared/createToolFlow";

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

  const handleSettingsReset = () => {
    ocrOperation.resetResults();
    onPreviewFile?.(null);
    setCurrentMode('ocr');
  };


  const filesCollapsed = expandedStep !== 'files';
  const settingsCollapsed = expandedStep !== 'settings';

  return (
    <Stack gap="sm" h="100%" p="sm" style={{ overflow: 'auto' }}>
      {createToolFlow({
        files: {
          selectedFiles,
          isCollapsed: hasFiles && filesCollapsed,
        },
        steps: [
          {
            title: "Settings",
            isCollapsed: !hasFiles || settingsCollapsed,
            isCompleted: hasFiles && hasValidSettings,
            onCollapsedClick: hasResults ? handleSettingsReset : () => {
              if (!hasFiles) return; // Only allow if files are selected
              setExpandedStep(expandedStep === 'settings' ? null : 'settings');
            },
            tooltip: ocrTips,
            content: (
              <OCRSettings
                parameters={ocrParams.parameters}
                onParameterChange={ocrParams.updateParameter}
                disabled={endpointLoading}
              />
            )
          },
          {
            title: "Advanced",
            isCollapsed: expandedStep !== 'advanced',
            isCompleted: hasFiles && hasResults,
            onCollapsedClick: hasResults ? handleSettingsReset : () => {
              if (!hasFiles) return; // Only allow if files are selected
              setExpandedStep(expandedStep === 'advanced' ? null : 'advanced');
            },
            content: (
              <AdvancedOCRSettings
                advancedOptions={ocrParams.parameters.additionalOptions}
                ocrRenderType={ocrParams.parameters.ocrRenderType}
                onParameterChange={ocrParams.updateParameter}
                disabled={endpointLoading}
              />
            )
          }
        ],
        executeButton: {
          text: t("ocr.operation.submit", "Process OCR and Review"),
          loadingText: t("loading"),
          onClick: handleOCR,
          isVisible: hasValidSettings && !hasResults,
          disabled: !ocrParams.validateParameters() || !hasFiles || !endpointEnabled
        },
        results: {
          isVisible: hasResults,
          operation: ocrOperation,
          title: t("ocr.results.title", "OCR Results"),
          onFileClick: handleThumbnailClick
        }
      })}
    </Stack>
  );
}

export default OCR;
