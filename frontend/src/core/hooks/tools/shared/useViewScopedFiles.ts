import { useMemo } from "react";
import { useAllFiles, useSelectedFiles } from "@app/contexts/FileContext";
import { useViewer } from "@app/contexts/ViewerContext";
import { useNavigationState } from "@app/contexts/NavigationContext";
import { StirlingFile } from "@app/types/fileContext";

/**
 * Returns the effective file set for tool operations.
 *
 * - Viewer: scopes to the single file currently shown, unless ignoreViewerScope is true.
 * - FileEditor: scopes to the selected subset (empty selection → empty → button disabled).
 * - PageEditor / custom workbenches: returns all loaded files (selection tracks pages, not files).
 */
export function useViewScopedFiles(ignoreViewerScope = false): StirlingFile[] {
  const { activeFileIndex } = useViewer();
  const { files: allFiles } = useAllFiles();
  const { workbench } = useNavigationState();
  const { selectedFiles } = useSelectedFiles();

  return useMemo(() => {
    if (workbench === "viewer" && !ignoreViewerScope) {
      const viewerFile = allFiles[activeFileIndex];
      return viewerFile ? [viewerFile] : allFiles;
    }

    if (workbench === "fileEditor") {
      return selectedFiles;
    }

    return allFiles;
  }, [workbench, allFiles, activeFileIndex, selectedFiles, ignoreViewerScope]);
}
