import { useCallback } from "react";
import { useAllFiles, useFileActions } from "@editor/contexts/FileContext";
import { useNavigationActions } from "@editor/contexts/NavigationContext";
import { useViewer } from "@editor/contexts/ViewerContext";
import { isStirlingFile } from "@editor/types/fileContext";

/**
 * Closes the document the viewer shows. The next file is picked before the
 * close, so the viewer and sidebar never point at one that is gone, and closing
 * the last returns to the file list.
 */
export function useCloseViewerDocument(): () => Promise<void> {
  const { files } = useAllFiles();
  const { actions: fileActions } = useFileActions();
  const { activeFileId, setActiveFileId } = useViewer();
  const { actions: navigation } = useNavigationActions();

  return useCallback(async () => {
    const file =
      (activeFileId
        ? files.find((f) => isStirlingFile(f) && f.fileId === activeFileId)
        : null) ?? files[0];
    const countBeforeRemove = files.length;
    if (file && isStirlingFile(file)) {
      const nextFile =
        files.find((f) => isStirlingFile(f) && f.fileId !== file.fileId) ??
        null;
      await fileActions.removeFiles([file.fileId], false);
      if (countBeforeRemove <= 1) {
        navigation.setWorkbench("fileEditor");
      } else if (nextFile && isStirlingFile(nextFile)) {
        setActiveFileId(nextFile.fileId);
      }
    } else if (countBeforeRemove <= 1) {
      navigation.setWorkbench("fileEditor");
    }
  }, [files, activeFileId, setActiveFileId, fileActions, navigation]);
}
