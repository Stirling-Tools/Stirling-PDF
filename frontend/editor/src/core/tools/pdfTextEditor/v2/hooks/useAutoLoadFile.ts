import { useEffect, useMemo, useRef } from "react";
import { useAllFiles, useFileSelection } from "@app/contexts/FileContext";
import { useNavigationState } from "@app/contexts/NavigationContext";
import { useViewer } from "@app/contexts/ViewerContext";

type Loader = (file: File) => unknown;

/**
 * Pick the file the user most likely wants open in the editor and load it
 * exactly once per key. Priority: explicit selection, then viewer's active
 * file, then the only file in the workbench.
 */
export function useAutoLoadFile(
  load: Loader,
  onFileChosen: (name: string) => void,
): void {
  const navigationState = useNavigationState();
  const { selectedFiles } = useFileSelection();
  const { files: allFiles } = useAllFiles();
  const { activeFileId } = useViewer();

  const autoLoadFile = useMemo(() => {
    if (selectedFiles[0]) return selectedFiles[0];
    if (activeFileId) {
      const viewerFile = allFiles.find(
        (f) => (f as File & { fileId?: string }).fileId === activeFileId,
      );
      if (viewerFile) return viewerFile;
    }
    if (allFiles.length === 1) return allFiles[0];
    return null;
  }, [selectedFiles, activeFileId, allFiles]);

  const lastKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!autoLoadFile) {
      lastKeyRef.current = null;
      return;
    }
    if (navigationState.selectedTool !== "pdfTextEditor") return;
    const f = autoLoadFile as File & { fileId?: string; quickKey?: string };
    const key =
      f.fileId ?? f.quickKey ?? `${f.name}|${f.size}|${f.lastModified}`;
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;
    onFileChosen(autoLoadFile.name);
    void load(autoLoadFile);
  }, [autoLoadFile, navigationState.selectedTool, load, onFileChosen]);
}
