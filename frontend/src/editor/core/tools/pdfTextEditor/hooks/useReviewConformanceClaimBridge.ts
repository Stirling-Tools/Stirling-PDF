import { useCallback, useEffect } from "react";
import { ACCESSIBILITY_EDITING } from "@editor/constants/featureFlags";
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
    ACCESSIBILITY_EDITING &&
    reviewing &&
    !state.loading &&
    state.hasDocument &&
    doc !== null;
  const editable = ready && doc.canSetConformanceClaim();
  const set = useCallback(
    (part: PdfUaPart | null) =>
      store.dispatch(new SetConformanceClaimCommand(part)),
    [store],
  );

  useEffect(() => {
    if (!ready || !sourceFileId) return;
    const published = {
      fileId: sourceFileId,
      part: state.conformanceClaim,
      editable,
      set,
    };
    reviewConformanceClaim.set(published);
    return () => {
      if (reviewConformanceClaim.get() === published)
        reviewConformanceClaim.set(null);
    };
  }, [ready, sourceFileId, state.conformanceClaim, editable, set]);
}
