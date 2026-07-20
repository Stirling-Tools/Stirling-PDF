import { useMemo } from "react";
import { useAllFiles } from "@editor/contexts/FileContext";
import { useViewer } from "@editor/contexts/ViewerContext";
import { useNavigationState } from "@editor/contexts/NavigationContext";
import { StirlingFile } from "@editor/types/fileContext";

export function useViewScopedFiles(ignoreViewerScope = false): StirlingFile[] {
  const { activeFileIndex } = useViewer();
  const { files: allFiles } = useAllFiles();
  const { workbench } = useNavigationState();

  return useMemo(() => {
    if (workbench === "viewer" && !ignoreViewerScope) {
      const viewerFile = allFiles[activeFileIndex];
      return viewerFile ? [viewerFile] : allFiles;
    }

    return allFiles;
  }, [workbench, allFiles, activeFileIndex, ignoreViewerScope]);
}
