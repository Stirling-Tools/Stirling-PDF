import { useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { ACCESSIBILITY_EDITING } from "@editor/constants/featureFlags";
import { SetMarkedTaggedCommand } from "@editor/tools/pdfTextEditor/commands/SetMarkedTaggedCommand";
import { ReviewSummary } from "@editor/tools/pdfTextEditor/components/review/ReviewSummary";
import type { Controller } from "@editor/tools/pdfTextEditor/components/toolbar/toolbarShared";
import type { ReviewProgress } from "@editor/tools/pdfTextEditor/hooks/useAccessibilityProgress";
import { useBulkTagging } from "@editor/tools/pdfTextEditor/hooks/useBulkTagging";
import { useHeadingOutline } from "@editor/tools/pdfTextEditor/hooks/useHeadingOutline";
import type {
  EditorStore,
  EditorViewState,
} from "@editor/tools/pdfTextEditor/store/EditorStore";
import { useReviewPanelSlot } from "@editor/tools/pdfTextEditor/store/reviewPanelSlot";
import { currentEditorSession } from "@editor/tools/pdfTextEditor/store/EditorSession";

/** Shows the review's document-wide state in the accessibility tool panel, when that panel is open. */
export function ReviewDocumentPanel({
  store,
  state,
  controller,
  review,
}: {
  store: EditorStore;
  state: EditorViewState;
  controller: Controller;
  review: ReviewProgress;
}) {
  const slot = useReviewPanelSlot();
  const shown = slot !== null;
  const editorDocument = store.document;
  const treatedAsTagged = useMemo(
    () => ACCESSIBILITY_EDITING && !!editorDocument?.treatAsTagged(),
    [editorDocument],
  );
  const headings = useHeadingOutline(store, state, shown && treatedAsTagged);
  const bulkTagging = useBulkTagging(store, state, shown && treatedAsTagged);
  // A document-wide setting saves at once, unlike tags, which wait for Save.
  const setMarkedTagged = useCallback(
    (marked: boolean) => {
      store.dispatch(new SetMarkedTaggedCommand(marked));
      currentEditorSession()?.autosave();
    },
    [store],
  );
  if (!slot) return null;
  return createPortal(
    <ReviewSummary
      progress={review}
      review={treatedAsTagged ? controller.accessibilityReview : null}
      untaggedPages={bulkTagging.untaggedPages}
      markedTagged={
        editorDocument?.canSetMarkedTagged()
          ? editorDocument.markedTagged()
          : null
      }
      onSetMarkedTagged={setMarkedTagged}
      hasTags={!!editorDocument?.hasStructureTree()}
      headingOutline={headings.outline}
      onSelectHeading={headings.selectHeading}
    />,
    slot,
  );
}
