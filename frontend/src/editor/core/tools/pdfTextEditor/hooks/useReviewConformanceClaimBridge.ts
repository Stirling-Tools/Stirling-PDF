import { useCallback, useEffect } from "react";
import type { FileId } from "@editor/types/file";
import { SetConformanceClaimCommand } from "@editor/tools/pdfTextEditor/commands/SetConformanceClaimCommand";
import type { PdfUaPart } from "@editor/tools/pdfTextEditor/pdfdoc/passes/conformanceClaim";
import type {
  EditorStore,
  EditorViewState,
} from "@editor/tools/pdfTextEditor/store/EditorStore";
import { reviewConformanceClaim } from "@editor/tools/pdfTextEditor/store/reviewConformanceClaim";

/**
 * While reviewing, publishes the open file's PDF/UA claim for the report and takes
 * the report's changes to it as undoable edits, written by the review's next Save.
 */
export function useReviewConformanceClaimBridge(
  store: EditorStore,
  state: EditorViewState,
  sourceFileId: FileId | null,
  reviewing: boolean,
): void {
  const doc = store.document;
  const ready =
    reviewing && !state.loading && state.hasDocument && doc !== null;
  const editable = ready && doc.canSetConformanceClaim();
  const set = useCallback(
    (part: PdfUaPart | null) =>
      store.dispatch(new SetConformanceClaimCommand(part)),
    [store],
  );

  // Published from the store's own notification rather than a render, so the
  // report's controls re-render with the editor instead of a commit later.
  useEffect(() => {
    if (!ready || !sourceFileId) return;
    const publish = () => {
      const part = store.getState().conformanceClaim;
      const current = reviewConformanceClaim.get();
      if (
        current?.fileId === sourceFileId &&
        current.part === part &&
        current.editable === editable &&
        current.set === set
      )
        return;
      reviewConformanceClaim.set({ fileId: sourceFileId, part, editable, set });
    };
    publish();
    const unsubscribe = store.subscribe(publish);
    return () => {
      unsubscribe();
      if (reviewConformanceClaim.get()?.fileId === sourceFileId)
        reviewConformanceClaim.set(null);
    };
  }, [ready, sourceFileId, editable, set, store]);
}
