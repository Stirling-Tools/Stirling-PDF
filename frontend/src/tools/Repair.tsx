import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useEndpointEnabled } from "../hooks/useEndpointConfig";
import { useFileContext } from "../contexts/FileContext";
import { useToolFileSelection } from "../contexts/FileSelectionContext";

import { createToolFlow } from "../components/tools/shared/createToolFlow";

import { useRepairParameters } from "../hooks/tools/repair/useRepairParameters";
import { useRepairOperation } from "../hooks/tools/repair/useRepairOperation";
import { BaseToolProps, ToolComponent } from "../types/tool";

const Repair = ({ onPreviewFile, onComplete, onError }: BaseToolProps) => {
  const { t } = useTranslation();
  const { setCurrentMode } = useFileContext();
  const { selectedFiles } = useToolFileSelection();

  const repairParams = useRepairParameters();
  const repairOperation = useRepairOperation();

  // Endpoint validation
  const { enabled: endpointEnabled, loading: endpointLoading } = useEndpointEnabled(repairParams.getEndpointName());

  useEffect(() => {
    repairOperation.resetResults();
    onPreviewFile?.(null);
  }, [repairParams.parameters]);

  const handleRepair = async () => {
    try {
      await repairOperation.executeOperation(repairParams.parameters, selectedFiles);
      if (repairOperation.files && onComplete) {
        onComplete(repairOperation.files);
      }
    } catch (error) {
      if (onError) {
        onError(error instanceof Error ? error.message : t("repair.error.failed", "Repair operation failed"));
      }
    }
  };

  const handleThumbnailClick = (file: File) => {
    onPreviewFile?.(file);
    sessionStorage.setItem("previousMode", "repair");
    setCurrentMode("viewer");
  };

  const handleSettingsReset = () => {
    repairOperation.resetResults();
    onPreviewFile?.(null);
    setCurrentMode("repair");
  };

  const hasFiles = selectedFiles.length > 0;
  const hasResults = repairOperation.files.length > 0 || repairOperation.downloadUrl !== null;

  return createToolFlow({
    files: {
      selectedFiles,
      isCollapsed: hasResults,
      placeholder: t("repair.files.placeholder", "Select a PDF file in the main view to get started"),
    },
    steps: [],
    executeButton: {
      text: t("repair.submit", "Repair PDF"),
      isVisible: !hasResults,
      loadingText: t("loading"),
      onClick: handleRepair,
      disabled: !repairParams.validateParameters() || !hasFiles || !endpointEnabled,
    },
    review: {
      isVisible: hasResults,
      operation: repairOperation,
      title: t("repair.results.title", "Repair Results"),
      onFileClick: handleThumbnailClick,
    },
  });
};

// Static method to get the operation hook for automation
Repair.tool = () => useRepairOperation;

export default Repair as ToolComponent;
