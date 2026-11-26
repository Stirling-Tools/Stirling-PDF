import { useCallback, useEffect } from "react";
import { ACCESSIBILITY_EDITING } from "@editor/constants/featureFlags";
import type { FileId } from "@editor/types/file";
import { SetMarkedTaggedCommand } from "@editor/tools/pdfTextEditor/commands/SetMarkedTaggedCommand";
import type {
  EditorStore,
  EditorViewState,
} from "@editor/tools/pdfTextEditor/store/EditorStore";
import { reviewMarkedTagged } from "@editor/tools/pdfTextEditor/store/reviewMarkedTagged";

/**
 * While reviewing, publishes whether the open file declares itself tagged for the
 * report, and takes the report's changes to it as undoable edits, written by the
 * review's next Save.
 */
export function useReviewMarkedTaggedBridge(
  store: EditorStore,
  state: EditorViewState,
  sourceFileId: FileId | null,
  reviewing: boolean,
): void {
  const doc = store.document;
  const ready =
    ACCESSIBILITY_EDITING &&
    reviewing &&
    !state.loading &&
    state.hasDocument &&
    doc !== null;
  const editable = ready && doc.canSetMarkedTagged();
  const set = useCallback(
    (marked: boolean) => {
      if (store.document?.markedTagged() === marked) return;
      store.dispatch(new SetMarkedTaggedCommand(marked));
    },
    [store],
  );

  // Published from the store's own notification rather than a render, so the
  // report's controls re-render with the editor instead of a commit later.
  useEffect(() => {
    if (!ready || !sourceFileId) return;
    const publish = () => {
      const marked = store.getState().markedTagged;
      const current = reviewMarkedTagged.get();
      if (
        current?.fileId === sourceFileId &&
        current.marked === marked &&
        current.editable === editable &&
        current.set === set
      )
        return;
      reviewMarkedTagged.set({ fileId: sourceFileId, marked, editable, set });
    };
    publish();
    const unsubscribe = store.subscribe(publish);
    return () => {
      unsubscribe();
      if (reviewMarkedTagged.get()?.fileId === sourceFileId)
        reviewMarkedTagged.set(null);
    };
  }, [ready, sourceFileId, editable, set, store]);
}
