import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import MergeSettings from "@app/components/tools/merge/MergeSettings";
import MergeFileSorter from "@app/components/tools/merge/MergeFileSorter";
import { useMergeParameters } from "@app/hooks/tools/merge/useMergeParameters";
import { useMergeOperation } from "@app/hooks/tools/merge/useMergeOperation";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@app/types/tool";
import { useMergeTips } from "@app/components/tooltips/useMergeTips";
import { useFileManagement, useSelectedFiles, useAllFiles } from "@app/contexts/FileContext";

const Merge = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const mergeTips = useMergeTips();

  // File selection hooks for custom sorting
  const { fileIds } = useAllFiles();
  const { selectedFileStubs } = useSelectedFiles();
  const { reorderFiles } = useFileManagement();

  const base = useBaseTool(
    'merge',
    useMergeParameters,
    useMergeOperation,
    props,
    { minFiles: 2 }
  );

  // Custom file sorting logic for merge tool
  const sortFiles = useCallback((sortType: 'filename' | 'dateModified', ascending: boolean = true) => {
    const sortedStubs = [...selectedFileStubs].sort((stubA, stubB) => {
      let comparison = 0;
      switch (sortType) {
        case 'filename':
          comparison = stubA.name.localeCompare(stubB.name);
          break;
        case 'dateModified':
          comparison = stubA.lastModified - stubB.lastModified;
          break;
      }
      return ascending ? comparison : -comparison;
    });

    const selectedIds = sortedStubs.map(record => record.id);
    const deselectedIds = fileIds.filter(id => !selectedIds.includes(id));
    reorderFiles([...selectedIds, ...deselectedIds]);
  }, [selectedFileStubs, fileIds, reorderFiles]);

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
      minFiles: 2,
    },
    steps: [
      {
        title: "Sort Files",
        isCollapsed: base.settingsCollapsed,
        content: (
          <MergeFileSorter
            onSortFiles={sortFiles}
            disabled={!base.hasFiles || base.endpointLoading}
          />
        ),
      },
      {
        title: "Settings",
        isCollapsed: base.settingsCollapsed,
        onCollapsedClick: base.settingsCollapsed ? base.handleSettingsReset : undefined,
        tooltip: mergeTips,
        content: (
          <MergeSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
          />
        ),
      },
    ],
    executeButton: {
      text: t("merge.submit", "Merge PDFs"),
      isVisible: !base.hasResults,
      loadingText: t("loading"),
      onClick: base.handleExecute,
      disabled: !base.params.validateParameters() || !base.hasFiles || !base.endpointEnabled,
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("merge.title", "Merge Results"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

export default Merge as ToolComponent;
