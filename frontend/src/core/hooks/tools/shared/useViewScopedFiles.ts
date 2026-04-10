import { useMemo } from "react";
import { useAllFiles, useSelectedFiles } from "@app/contexts/FileContext";
import { useViewer } from "@app/contexts/ViewerContext";
import { useNavigationState } from "@app/contexts/NavigationContext";
import { StirlingFile } from "@app/types/fileContext";

export function useViewScopedFiles(ignoreViewerScope = false): StirlingFile[] {
  const { activeFileIndex } = useViewer();
  const { files: allFiles } = useAllFiles();
  const { selectedFiles } = useSelectedFiles();
  const { workbench } = useNavigationState();

  return useMemo(() => {
    if (workbench === "viewer" && !ignoreViewerScope) {
      const viewerFile = allFiles[activeFileIndex];
      return viewerFile ? [viewerFile] : allFiles;
    }

    if (workbench === "fileEditor") {
      return selectedFiles;
    }

    return allFiles;
  }, [workbench, allFiles, selectedFiles, activeFileIndex, ignoreViewerScope]);
}
