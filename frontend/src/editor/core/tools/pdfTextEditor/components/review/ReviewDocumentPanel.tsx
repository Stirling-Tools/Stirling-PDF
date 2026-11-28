import { useMemo } from "react";
import { createPortal } from "react-dom";
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
    () => !!editorDocument?.treatAsTagged(),
    [editorDocument],
  );
  const headings = useHeadingOutline(store, state, shown && treatedAsTagged);
  const bulkTagging = useBulkTagging(store, state, shown && treatedAsTagged);
  if (!slot) return null;
  return createPortal(
    <ReviewSummary
      progress={review}
      review={treatedAsTagged ? controller.accessibilityReview : null}
      untaggedPages={bulkTagging.untaggedPages}
      headingOutline={headings.outline}
      onSelectHeading={headings.selectHeading}
    />,
    slot,
  );
}
