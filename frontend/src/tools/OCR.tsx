import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useEndpointEnabled } from "../hooks/useEndpointConfig";
import { useFileContext } from "../contexts/FileContext";
import { useToolFileSelection } from "../contexts/FileSelectionContext";

import { createToolFlow } from "../components/tools/shared/createToolFlow";

import OCRSettings from "../components/tools/ocr/OCRSettings";
import AdvancedOCRSettings from "../components/tools/ocr/AdvancedOCRSettings";

import { useOCRParameters } from "../hooks/tools/ocr/useOCRParameters";
import { useOCROperation } from "../hooks/tools/ocr/useOCROperation";
import { BaseToolProps, ToolComponent } from "../types/tool";
import { useOCRTips } from "../components/tooltips/useOCRTips";

const OCR = ({ onPreviewFile, onComplete, onError }: BaseToolProps) => {
  const { t } = useTranslation();
  const { setCurrentMode } = useFileContext();
  const { selectedFiles } = useToolFileSelection();

  const ocrParams = useOCRParameters();
  const ocrOperation = useOCROperation();
  const ocrTips = useOCRTips();

  // Step expansion state management
  const [expandedStep, setExpandedStep] = useState<"files" | "settings" | "advanced" | null>("files");

  const { enabled: endpointEnabled, loading: endpointLoading } = useEndpointEnabled("ocr-pdf");

  const hasFiles = selectedFiles.length > 0;
  const hasResults = ocrOperation.files.length > 0 || ocrOperation.downloadUrl !== null;
  const hasValidSettings = ocrParams.validateParameters();

  useEffect(() => {
    ocrOperation.resetResults();
    onPreviewFile?.(null);
  }, [ocrParams.parameters]);

  useEffect(() => {
    if (selectedFiles.length > 0 && expandedStep === "files") {
      setExpandedStep("settings");
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
      await ocrOperation.executeOperation(ocrParams.parameters, selectedFiles);
      if (ocrOperation.files && onComplete) {
        onComplete(ocrOperation.files);
      }
    } catch (error) {
      if (onError) {
        onError(error instanceof Error ? error.message : "OCR operation failed");
      }
    }
  };

  const handleThumbnailClick = (file: File) => {
    onPreviewFile?.(file);
    sessionStorage.setItem("previousMode", "ocr");
    setCurrentMode("viewer");
  };

  const handleSettingsReset = () => {
    ocrOperation.resetResults();
    onPreviewFile?.(null);
    setCurrentMode("ocr");
  };

  const settingsCollapsed = expandedStep !== "settings";

  return createToolFlow({
    files: {
      selectedFiles,
      isCollapsed: hasResults,
    },
    steps: [
      {
        title: "Settings",
        isCollapsed: !hasFiles || settingsCollapsed,
        onCollapsedClick: hasResults
          ? handleSettingsReset
          : () => {
              if (!hasFiles) return; // Only allow if files are selected
              setExpandedStep(expandedStep === "settings" ? null : "settings");
            },
        tooltip: ocrTips,
        content: (
          <OCRSettings
            parameters={ocrParams.parameters}
            onParameterChange={ocrParams.updateParameter}
            disabled={endpointLoading}
          />
        ),
      },
      {
        title: "Advanced",
        isCollapsed: expandedStep !== "advanced",
        onCollapsedClick: hasResults
          ? handleSettingsReset
          : () => {
              if (!hasFiles) return; // Only allow if files are selected
              setExpandedStep(expandedStep === "advanced" ? null : "advanced");
            },
        content: (
          <AdvancedOCRSettings
            advancedOptions={ocrParams.parameters.additionalOptions}
            ocrRenderType={ocrParams.parameters.ocrRenderType}
            onParameterChange={ocrParams.updateParameter}
            disabled={endpointLoading}
          />
        ),
      },
    ],
    executeButton: {
      text: t("ocr.operation.submit", "Process OCR and Review"),
      loadingText: t("loading"),
      onClick: handleOCR,
      isVisible: hasValidSettings && !hasResults,
      disabled: !ocrParams.validateParameters() || !hasFiles || !endpointEnabled,
    },
    review: {
      isVisible: hasResults,
      operation: ocrOperation,
      title: t("ocr.results.title", "OCR Results"),
      onFileClick: handleThumbnailClick,
    },
  });
};

// Static method to get the operation hook for automation
OCR.tool = () => useOCROperation;

export default OCR as ToolComponent;
