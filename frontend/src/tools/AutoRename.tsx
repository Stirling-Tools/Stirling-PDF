import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useEndpointEnabled } from "../hooks/useEndpointConfig";
import { useFileContext } from "../contexts/FileContext";
import { useToolFileSelection } from "../contexts/FileSelectionContext";

import { createToolFlow } from "../components/tools/shared/createToolFlow";

import { useAutoRenameParameters } from "../hooks/tools/autoRename/useAutoRenameParameters";
import { useAutoRenameOperation } from "../hooks/tools/autoRename/useAutoRenameOperation";
import { BaseToolProps } from "../types/tool";

const AutoRename = ({ onPreviewFile, onComplete, onError }: BaseToolProps) => {
  const { t } = useTranslation();
  const { setCurrentMode } = useFileContext();
  const { selectedFiles } = useToolFileSelection();

  const autoRenameParams = useAutoRenameParameters();
  const autoRenameOperation = useAutoRenameOperation();

  // Endpoint validation
  const { enabled: endpointEnabled, loading: endpointLoading } = useEndpointEnabled(autoRenameParams.getEndpointName());

  useEffect(() => {
    autoRenameOperation.resetResults();
    onPreviewFile?.(null);
  }, [autoRenameParams.parameters]);

  const handleAutoRename = async () => {
    try {
      await autoRenameOperation.executeOperation(autoRenameParams.parameters, selectedFiles);
      if (autoRenameOperation.files && onComplete) {
        onComplete(autoRenameOperation.files);
      }
    } catch (error) {
      if (onError) {
        onError(error instanceof Error ? error.message : t("autoRename.error.failed", "Auto-rename operation failed"));
      }
    }
  };

  const handleThumbnailClick = (file: File) => {
    onPreviewFile?.(file);
    sessionStorage.setItem("previousMode", "auto-rename-pdf-file");
    setCurrentMode("viewer");
  };

  const handleSettingsReset = () => {
    autoRenameOperation.resetResults();
    onPreviewFile?.(null);
    setCurrentMode("auto-rename-pdf-file");
  };

  const hasFiles = selectedFiles.length > 0;
  const hasResults = autoRenameOperation.files.length > 0 || autoRenameOperation.downloadUrl !== null;

  return createToolFlow({
    files: {
      selectedFiles,
      isCollapsed: hasFiles || hasResults,
      placeholder: t("autoRename.files.placeholder", "Select a PDF file in the main view to get started"),
    },
    steps: [],
    executeButton: {
      text: t("autoRename.submit", "Auto-Rename"),
      isVisible: !hasResults,
      loadingText: t("loading"),
      onClick: handleAutoRename,
      disabled: !autoRenameParams.validateParameters() || !hasFiles || !endpointEnabled,
    },
    review: {
      isVisible: hasResults,
      operation: autoRenameOperation,
      title: t("autoRename.results.title", "Auto-Rename Results"),
      onFileClick: handleThumbnailClick,
    },
  });
};

export default AutoRename;