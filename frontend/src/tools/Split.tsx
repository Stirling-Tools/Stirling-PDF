import React, { useEffect } from "react";
import { Stack } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useEndpointEnabled } from "../hooks/useEndpointConfig";
import { useFileContext } from "../contexts/FileContext";
import { useToolFileSelection } from "../contexts/FileSelectionContext";

import { createToolFlow } from "../components/tools/shared/createToolFlow";
import SplitSettings from "../components/tools/split/SplitSettings";

import { useSplitParameters } from "../hooks/tools/split/useSplitParameters";
import { useSplitOperation } from "../hooks/tools/split/useSplitOperation";
import { BaseToolProps } from "../types/tool";

const Split = ({ onPreviewFile, onComplete, onError }: BaseToolProps) => {
  const { t } = useTranslation();
  const { setCurrentMode } = useFileContext();
  const { selectedFiles } = useToolFileSelection();

  const splitParams = useSplitParameters();
  const splitOperation = useSplitOperation();

  // Endpoint validation
  const { enabled: endpointEnabled, loading: endpointLoading } = useEndpointEnabled(
    splitParams.getEndpointName()
  );

  useEffect(() => {
    splitOperation.resetResults();
    onPreviewFile?.(null);
  }, [splitParams.parameters, selectedFiles]);

  const handleSplit = async () => {
    try {
      await splitOperation.executeOperation(
        splitParams.parameters,
        selectedFiles
      );
      if (splitOperation.files && onComplete) {
        onComplete(splitOperation.files);
      }
    } catch (error) {
      if (onError) {
        onError(error instanceof Error ? error.message : 'Split operation failed');
      }
    }
  };

  const handleThumbnailClick = (file: File) => {
    onPreviewFile?.(file);
    sessionStorage.setItem('previousMode', 'split');
    setCurrentMode('viewer');
  };

  const handleSettingsReset = () => {
    splitOperation.resetResults();
    onPreviewFile?.(null);
    setCurrentMode('split');
  };

  const hasFiles = selectedFiles.length > 0;
  const hasResults = splitOperation.downloadUrl !== null;
  const filesCollapsed = hasFiles;
  const settingsCollapsed = !hasFiles || hasResults;

  return (
    <Stack gap="sm" h="100%" p="sm" style={{ overflow: 'auto' }}>
      {createToolFlow({
        files: {
          selectedFiles,
          isCollapsed: filesCollapsed,
          placeholder: "Select a PDF file in the main view to get started"
        },
        steps: [{
          title: "Settings",
          isCollapsed: settingsCollapsed,
          isCompleted: hasResults,
          onCollapsedClick: hasResults ? handleSettingsReset : undefined,
          content: (
            <SplitSettings
              parameters={splitParams.parameters}
              onParameterChange={splitParams.updateParameter}
              disabled={endpointLoading}
            />
          )
        }],
        executeButton: {
          text: t("split.submit", "Split PDF"),
          loadingText: t("loading"),
          onClick: handleSplit,
          isVisible: !hasResults,
          disabled: !splitParams.validateParameters() || !hasFiles || !endpointEnabled
        },
        results: {
          isVisible: hasResults,
          operation: splitOperation,
          title: "Split Results",
          onFileClick: handleThumbnailClick
        }
      })}
    </Stack>
  );
}

export default Split;
