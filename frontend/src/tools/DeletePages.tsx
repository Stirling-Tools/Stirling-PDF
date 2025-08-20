import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useEndpointEnabled } from "../hooks/useEndpointConfig";
import { useFileContext } from "../contexts/FileContext";
import { useToolFileSelection } from "../contexts/FileSelectionContext";

import { createToolFlow } from "../components/tools/shared/createToolFlow";

import { useDeletePagesParameters } from "../hooks/tools/deletePages/useDeletePagesParameters";
import { useDeletePagesOperation } from "../hooks/tools/deletePages/useDeletePagesOperation";
import DeletePagesSettings from "../components/tools/deletePages/DeletePagesSettings";
import { usePageSelectionTips } from "../components/tooltips/usePageSelectionTips";
import { BaseToolProps } from "../types/tool";

const DeletePages = ({ onPreviewFile, onComplete, onError }: BaseToolProps) => {
  const { t } = useTranslation();
  const { setCurrentMode } = useFileContext();
  const { selectedFiles } = useToolFileSelection();

  const deletePagesParams = useDeletePagesParameters();
  const deletePagesOperation = useDeletePagesOperation();
  const pageSelectionTips = usePageSelectionTips();

  // Endpoint validation
  const { enabled: endpointEnabled, loading: endpointLoading } = useEndpointEnabled(deletePagesParams.getEndpointName());

  useEffect(() => {
    deletePagesOperation.resetResults();
    onPreviewFile?.(null);
  }, [deletePagesParams.parameters]);

  const handleDeletePages = async () => {
    try {
      await deletePagesOperation.executeOperation(deletePagesParams.parameters, selectedFiles);
      if (deletePagesOperation.files && onComplete) {
        onComplete(deletePagesOperation.files);
      }
    } catch (error) {
      if (onError) {
        onError(error instanceof Error ? error.message : t("removePages.error.failed", "Delete pages operation failed"));
      }
    }
  };

  const handleThumbnailClick = (file: File) => {
    onPreviewFile?.(file);
    sessionStorage.setItem("previousMode", "deletePages");
    setCurrentMode("viewer");
  };

  const handleSettingsReset = () => {
    deletePagesOperation.resetResults();
    onPreviewFile?.(null);
    setCurrentMode("deletePages");
  };

  const hasFiles = selectedFiles.length > 0;
  const hasResults = deletePagesOperation.files.length > 0 || deletePagesOperation.downloadUrl !== null;

  const settingsCollapsed = !hasFiles || hasResults;

  return createToolFlow({
    files: {
      selectedFiles,
      isCollapsed: hasFiles && !hasResults,
      placeholder: t("removePages.files.placeholder", "Select a PDF file in the main view to get started"),
    },
    steps: [
      {
        title: t("removePages.settings.title", "Page Selection"),
        isCollapsed: settingsCollapsed,
        onCollapsedClick: settingsCollapsed ? handleSettingsReset : undefined,
        tooltip: pageSelectionTips,
        content: (
          <DeletePagesSettings
            parameters={deletePagesParams.parameters}
            onParameterChange={deletePagesParams.updateParameter}
            disabled={endpointLoading}
          />
        ),
      }
    ],
    executeButton: {
      text: t("removePages.submit", "Remove Pages"),
      isVisible: !hasResults,
      loadingText: t("loading"),
      onClick: handleDeletePages,
      disabled: !deletePagesParams.validateParameters() || !hasFiles || !endpointEnabled,
    },
    review: {
      isVisible: hasResults,
      operation: deletePagesOperation,
      title: t("removePages.results.title", "Page Removal Results"),
      onFileClick: handleThumbnailClick,
    },
  });
};

export default DeletePages;