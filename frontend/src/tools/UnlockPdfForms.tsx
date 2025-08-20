import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useEndpointEnabled } from "../hooks/useEndpointConfig";
import { useFileContext } from "../contexts/FileContext";
import { useToolFileSelection } from "../contexts/FileSelectionContext";

import { createToolFlow } from "../components/tools/shared/createToolFlow";

import { useUnlockPdfFormsParameters } from "../hooks/tools/unlockPdfForms/useUnlockPdfFormsParameters";
import { useUnlockPdfFormsOperation } from "../hooks/tools/unlockPdfForms/useUnlockPdfFormsOperation";
import { BaseToolProps, ToolComponent } from "../types/tool";

const UnlockPdfForms = ({ onPreviewFile, onComplete, onError }: BaseToolProps) => {
  const { t } = useTranslation();
  const { setCurrentMode } = useFileContext();
  const { selectedFiles } = useToolFileSelection();

  const unlockPdfFormsParams = useUnlockPdfFormsParameters();
  const unlockPdfFormsOperation = useUnlockPdfFormsOperation();

  // Endpoint validation
  const { enabled: endpointEnabled, loading: endpointLoading } = useEndpointEnabled(unlockPdfFormsParams.getEndpointName());

  useEffect(() => {
    unlockPdfFormsOperation.resetResults();
    onPreviewFile?.(null);
  }, [unlockPdfFormsParams.parameters]);

  const handleUnlock = async () => {
    try {
      await unlockPdfFormsOperation.executeOperation(unlockPdfFormsParams.parameters, selectedFiles);
      if (unlockPdfFormsOperation.files && onComplete) {
        onComplete(unlockPdfFormsOperation.files);
      }
    } catch (error) {
      if (onError) {
        onError(error instanceof Error ? error.message : t("unlockPDFForms.error.failed", "Unlock PDF forms operation failed"));
      }
    }
  };

  const handleThumbnailClick = (file: File) => {
    onPreviewFile?.(file);
    sessionStorage.setItem("previousMode", "unlockPdfForms");
    setCurrentMode("viewer");
  };

  const handleSettingsReset = () => {
    unlockPdfFormsOperation.resetResults();
    onPreviewFile?.(null);
    setCurrentMode("unlockPdfForms");
  };

  const hasFiles = selectedFiles.length > 0;
  const hasResults = unlockPdfFormsOperation.files.length > 0 || unlockPdfFormsOperation.downloadUrl !== null;

  return createToolFlow({
    files: {
      selectedFiles,
      isCollapsed: hasFiles || hasResults,
      placeholder: t("unlockPDFForms.files.placeholder", "Select a PDF file in the main view to get started"),
    },
    steps: [],
    executeButton: {
      text: t("unlockPDFForms.submit", "Unlock Forms"),
      isVisible: !hasResults,
      loadingText: t("loading"),
      onClick: handleUnlock,
      disabled: !unlockPdfFormsParams.validateParameters() || !hasFiles || !endpointEnabled,
    },
    review: {
      isVisible: hasResults,
      operation: unlockPdfFormsOperation,
      title: t("unlockPDFForms.results.title", "Unlocked Forms Results"),
      onFileClick: handleThumbnailClick,
    },
  });
};

// Static method to get the operation hook for automation
UnlockPdfForms.tool = () => useUnlockPdfFormsOperation;

export default UnlockPdfForms as ToolComponent;