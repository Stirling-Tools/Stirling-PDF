import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useEndpointEnabled } from "../hooks/useEndpointConfig";
import { useFileSelection, useFileManagement, useSelectedFiles, useAllFiles } from "../contexts/FileContext";

import { createToolFlow } from "../components/tools/shared/createToolFlow";
import MergeSettings from "../components/tools/merge/MergeSettings";
import MergeFileSorter from "../components/tools/merge/MergeFileSorter";

import { useMergeParameters } from "../hooks/tools/merge/useMergeParameters";
import { useMergeOperation } from "../hooks/tools/merge/useMergeOperation";
import { BaseToolProps } from "../types/tool";

const Merge = ({ onPreviewFile, onComplete, onError }: BaseToolProps) => {
  const { t } = useTranslation();
  const { selectedFiles, selectedFileIds } = useFileSelection();
  const { fileIds } = useAllFiles()
  const { selectedRecords } = useSelectedFiles()
  const { reorderFiles } = useFileManagement();

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
  };

  const handleSettingsReset = () => {
    mergeOperation.resetResults();
    onPreviewFile?.(null);
  };

  const handleUndo = async () => {
    await mergeOperation.undoOperation();
    onPreviewFile?.(null);
  };

  // TODO: Move to more general place so other tools can use it
  const sortFiles = useCallback((sortType: 'filename' | 'dateModified', ascending: boolean = true) => {
    // Sort the FileIds based on their corresponding File properties
    const sortedRecords = [...selectedRecords].sort((recordA, recordB) => {
      let comparison = 0;
      switch (sortType) {
        case 'filename':
          comparison = recordA.name.localeCompare(recordB.name);
          break;
        case 'dateModified':
          comparison = recordA.lastModified - recordB.lastModified;
          break;
      }

      return ascending ? comparison : -comparison;
    });

    const selectedIds = sortedRecords.map(record => record.id);
    const deselectedIds = fileIds.filter(id => !selectedIds.includes(id));

    reorderFiles([...selectedIds, ...deselectedIds]); // Move all sorted IDs to the front of the workbench
  }, [selectedFiles, selectedFileIds, reorderFiles]);

  const minFiles = 2; // Merging one file doesn't make sense
  const hasFiles = selectedFiles.length >= minFiles;
  const hasResults = mergeOperation.files.length > 0 || mergeOperation.downloadUrl !== null;
  const settingsCollapsed = !hasFiles || hasResults;

  return createToolFlow({
    files: {
      selectedFiles: selectedFiles,
      isCollapsed: hasFiles && !hasResults,
      placeholder: "Select multiple PDF files to merge",
      minFiles: minFiles,
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
        tooltip: {
          tips: [
            {
              title: t('merge.removeDigitalSignature.tooltip.title', 'Remove Digital Signature'),
              description: t('merge.removeDigitalSignature.tooltip.description', 'Digital signatures will be invalidated when merging files. Check this to remove them from the final merged PDF.')
            },
            {
              title: t('merge.generateTableOfContents.tooltip.title', 'Generate Table of Contents'),
              description: t('merge.generateTableOfContents.tooltip.description', 'Automatically creates a clickable table of contents in the merged PDF based on the original file names and page numbers.')
            }
          ]
        },
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
      onUndo: handleUndo,
    },
  });
};

export default Merge;
