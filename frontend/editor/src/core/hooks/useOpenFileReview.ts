import { useCallback } from "react";
import { useViewer } from "@app/contexts/ViewerContext";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { useFileState, useFileActions } from "@app/contexts/FileContext";
import { fileStorage } from "@app/services/fileStorage";
import type { FileId } from "@app/types/file";

/**
 * Opens the Review tool for a file, loading it into the workbench first. Badges
 * show on the whole stored library, and the viewer drops an unloaded active id.
 */
export function useOpenFileReview(): (fileId: string) => void {
  const { setActiveFileId } = useViewer();
  const { handleToolSelect } = useToolWorkflow();
  const { state } = useFileState();
  const { actions } = useFileActions();

  return useCallback(
    (fileId: string) => {
      const inWorkbench = state.files.ids.some(
        (id) => (id as string) === fileId,
      );
      if (inWorkbench) {
        setActiveFileId(fileId);
        handleToolSelect("review");
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
        setActiveFileId(fileId);
        handleToolSelect("review");
      })();
    },
    [state.files.ids, actions, setActiveFileId, handleToolSelect],
  );
}
