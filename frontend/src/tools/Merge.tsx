import React, { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useEndpointEnabled } from "../hooks/useEndpointConfig";
import { useFileContext } from "../contexts/FileContext";
import { useToolFileSelection, useFileSelectionActions } from "../contexts/FileSelectionContext";

import { createToolFlow } from "../components/tools/shared/createToolFlow";
import MergeSettings from "../components/tools/merge/MergeSettings";
import MergeFileSorter from "../components/tools/merge/MergeFileSorter";

import { useMergeParameters } from "../hooks/tools/merge/useMergeParameters";
import { useMergeOperation } from "../hooks/tools/merge/useMergeOperation";
import { BaseToolProps } from "../types/tool";

const Merge = ({ onPreviewFile, onComplete, onError }: BaseToolProps) => {
  const { t } = useTranslation();
  const { setCurrentMode } = useFileContext();
  const { selectedFiles } = useToolFileSelection();
  const { setSelectedFiles } = useFileSelectionActions();

  const mergeParams = useMergeParameters();
  const mergeOperation = useMergeOperation();

  // Endpoint validation
  const { enabled: endpointEnabled, loading: endpointLoading } = useEndpointEnabled("merge-pdfs");

  useEffect(() => {
    mergeOperation.resetResults();
    onPreviewFile?.(null);
  }, [mergeParams.parameters]);

  const handleMerge = async () => {
    try {
      await mergeOperation.executeOperation(mergeParams.parameters, selectedFiles);
      if (mergeOperation.files && onComplete) {
        onComplete(mergeOperation.files);
      }
    } catch (error) {
      if (onError) {
        onError(error instanceof Error ? error.message : "Merge operation failed");
      }
    }
  };

  const handleThumbnailClick = (file: File) => {
    onPreviewFile?.(file);
    sessionStorage.setItem("previousMode", "merge");
    setCurrentMode("viewer");
  };

  const handleSettingsReset = () => {
    mergeOperation.resetResults();
    onPreviewFile?.(null);
    setCurrentMode("merge");
  };

  const sortFiles = useCallback((sortType: 'filename' | 'dateModified', ascending: boolean = true) => {
    setSelectedFiles(((prevFiles: File[]) => {
      const sortedFiles = [...prevFiles].sort((a, b) => {
        let comparison = 0;

        switch (sortType) {
          case 'filename':
            comparison = a.name.localeCompare(b.name);
            break;
          case 'dateModified':
            comparison = a.lastModified - b.lastModified;
            break;
        }

        return ascending ? comparison : -comparison;
      });

      return sortedFiles;
    }) as any /* FIX ME: Parameter type is wrong on setSelectedFiles */);
  }, []);

  const hasFiles = selectedFiles.length > 1; // Merge requires at least 2 files
  const hasResults = mergeOperation.files.length > 0 || mergeOperation.downloadUrl !== null;
  const settingsCollapsed = !hasFiles || hasResults;

  return createToolFlow({
    files: {
      selectedFiles,
      isCollapsed: hasFiles && !hasResults,
      placeholder: "Select multiple PDF files to merge",
    },
    steps: [
      {
        title: "Sort Files",
        isCollapsed: settingsCollapsed,
        content: (
          <MergeFileSorter
            onSortFiles={sortFiles}
            disabled={!hasFiles || endpointLoading}
          />
        ),
      },
      {
        title: "Settings",
        isCollapsed: settingsCollapsed,
        onCollapsedClick: settingsCollapsed ? handleSettingsReset : undefined,
        content: (
          <MergeSettings
            parameters={mergeParams.parameters}
            onParameterChange={mergeParams.updateParameter}
            disabled={endpointLoading}
          />
        ),
      },
    ],
    executeButton: {
      text: t("merge.submit", "Merge PDFs"),
      isVisible: !hasResults,
      loadingText: t("loading"),
      onClick: handleMerge,
      disabled: !mergeParams.validateParameters() || !hasFiles || !endpointEnabled,
    },
    review: {
      isVisible: hasResults,
      operation: mergeOperation,
      title: t("merge.title", "Merge Results"),
      onFileClick: handleThumbnailClick,
    },
  });
};

export default Merge;
