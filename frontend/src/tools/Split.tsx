import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useEndpointEnabled } from "../hooks/useEndpointConfig";
import { useFileSelection } from "../contexts/FileContext";
import { useNavigationActions } from "../contexts/NavigationContext";

import { createToolFlow } from "../components/tools/shared/createToolFlow";
import SplitSettings from "../components/tools/split/SplitSettings";

import { useSplitParameters } from "../hooks/tools/split/useSplitParameters";
import { useSplitOperation } from "../hooks/tools/split/useSplitOperation";
import { BaseToolProps, ToolComponent } from "../types/tool";

const Split = ({ onPreviewFile, onComplete, onError }: BaseToolProps) => {
  const { t } = useTranslation();
  const { actions } = useNavigationActions();
  const { selectedFiles } = useFileSelection();

  const splitParams = useSplitParameters();
  const splitOperation = useSplitOperation();

  // Endpoint validation
  const { enabled: endpointEnabled, loading: endpointLoading } = useEndpointEnabled(splitParams.getEndpointName());

  useEffect(() => {
    // Only reset results when parameters change, not when files change
    splitOperation.resetResults();
    onPreviewFile?.(null);
  }, [splitParams.parameters]);

  useEffect(() => {
    // Reset results when selected files change (user selected different files)
    if (selectedFiles.length > 0) {
      splitOperation.resetResults();
      onPreviewFile?.(null);
    }
  }, [selectedFiles]);
  const handleSplit = async () => {
    try {
      await splitOperation.executeOperation(splitParams.parameters, selectedFiles);
      if (splitOperation.files && onComplete) {
        onComplete(splitOperation.files);
      }
    } catch (error) {
      if (onError) {
        onError(error instanceof Error ? error.message : "Split operation failed");
      }
    }
  };

  const handleThumbnailClick = (file: File) => {
    onPreviewFile?.(file);
    sessionStorage.setItem("previousMode", "split");
  };

  const handleSettingsReset = () => {
    splitOperation.resetResults();
    onPreviewFile?.(null);
    actions.setMode("split");
  };

  const hasFiles = selectedFiles.length > 0;
  const hasResults = splitOperation.files.length > 0 || splitOperation.downloadUrl !== null;
  const settingsCollapsed = !hasFiles || hasResults;

  return createToolFlow({
    files: {
      selectedFiles,
      isCollapsed: hasResults,
      placeholder: "Select a PDF file in the main view to get started",
    },
    steps: [
      {
        title: "Settings",
        isCollapsed: settingsCollapsed,
        onCollapsedClick: hasResults ? handleSettingsReset : undefined,
        content: (
          <SplitSettings
            parameters={splitParams.parameters}
            onParameterChange={splitParams.updateParameter}
            disabled={endpointLoading}
          />
        ),
      },
    ],
    executeButton: {
      text: t("split.submit", "Split PDF"),
      loadingText: t("loading"),
      onClick: handleSplit,
      isVisible: !hasResults,
      disabled: !splitParams.validateParameters() || !hasFiles || !endpointEnabled,
    },
    review: {
      isVisible: hasResults,
      operation: splitOperation,
      title: "Split Results",
      onFileClick: handleThumbnailClick,
    },
  });
};

export default Split as ToolComponent;
