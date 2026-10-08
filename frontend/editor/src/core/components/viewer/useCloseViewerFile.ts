import { useCallback } from "react";
import { useAllFiles, useFileActions } from "@app/contexts/FileContext";
import {
  useNavigationActions,
  useNavigationGuard,
} from "@app/contexts/NavigationContext";
import { useViewer } from "@app/contexts/ViewerContext";
import { useEditorSession } from "@app/tools/pdfTextEditor/store/EditorSession";
import type { FileId } from "@app/types/file";

/**
 * Removes a document from the workbench while it may be on screen: the viewer
 * moves to the next file first, so it never lands on one that is gone, and the
 * last close returns to the file list. Closing the document being text edited
 * throws its unsaved edits away, so that asks first.
 */
export function useCloseViewerFile() {
  const session = useEditorSession();
  const { files } = useAllFiles();
  const { actions: fileActions } = useFileActions();
  const { activeFileId, setActiveFileId } = useViewer();
  const { requestNavigation } = useNavigationGuard();
  const { actions: navigation } = useNavigationActions();

  return useCallback(
    (fileId: FileId) => {
      const remove = async () => {
        const remaining = files.filter(
          (f) => (f as File & { fileId?: FileId }).fileId !== fileId,
        );
        const next = remaining[0] as (File & { fileId?: FileId }) | undefined;
        const shown =
          activeFileId ?? (files[0] as File & { fileId?: FileId })?.fileId;
        if (fileId === shown && next?.fileId) setActiveFileId(next.fileId);
        await fileActions.removeFiles([fileId], false);
        if (remaining.length === 0) navigation.setWorkbench("fileEditor");
      };
      if (fileId === session?.fileId && session.dirty) {
        requestNavigation(() => void remove());
      } else {
        void remove();
      }
    },
    [
      files,
      activeFileId,
      setActiveFileId,
      fileActions,
      navigation,
      requestNavigation,
      session,
    ],
  );
}
