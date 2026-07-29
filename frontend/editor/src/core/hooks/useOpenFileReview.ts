import { useCallback } from "react";
import { useViewer } from "@app/contexts/ViewerContext";
import { useNavigationActions } from "@app/contexts/NavigationContext";
import { useFileState, useFileActions } from "@app/contexts/FileContext";
import { fileStorage } from "@app/services/fileStorage";
import type { FileId } from "@app/types/file";

/**
 * Opens a file for review: loads it into the workbench if needed, shows it in
 * the viewer, and opens the viewer's review panel. Used by the needs-review
 * badges in the file lists and by the export gate's "Review now".
 *
 * Review is a viewer panel (like bookmarks or comments) rather than a tool, so
 * this only has to put the right document on screen — the panel follows it.
 */
export function useOpenFileReview(): (fileId: string) => void {
  const { setActiveFileId, setReviewSidebarVisible } = useViewer();
  const { actions: navActions } = useNavigationActions();
  const { state } = useFileState();
  const { actions } = useFileActions();

  return useCallback(
    (fileId: string) => {
      const show = () => {
        setActiveFileId(fileId);
        navActions.setWorkbench("viewer");
        setReviewSidebarVisible(true);
      };

      if (state.files.ids.some((id) => (id as string) === fileId)) {
        show();
        return;
      }
      void (async () => {
        // Re-add by stub to preserve the file's id — addFiles would mint a new
        // one, orphaning the policy runs (and badge) recorded against it.
        const stub = await fileStorage
          .getStirlingFileStub(fileId as FileId)
          .catch(() => null);
        if (!stub) return;
        await actions.addStirlingFileStubs([stub]);
        show();
      })();
    },
    [
      state.files.ids,
      actions,
      navActions,
      setActiveFileId,
      setReviewSidebarVisible,
    ],
  );
}
