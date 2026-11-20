import { Suspense, lazy } from "react";
import { useNavigationState } from "@editor/contexts/NavigationContext";
import { useReviewMode } from "@editor/tools/pdfTextEditor/store/reviewMode";
import {
  useEndReviewOutsideAccessibilityTool,
  useReviewAvailable,
} from "@editor/tools/pdfTextEditor/hooks/useEditOrReview";

const PdfTextEditor = lazy(
  () => import("@editor/tools/pdfTextEditor/PdfTextEditor"),
);

/**
 * Runs the editor hidden while a review is open in the accessibility tool; its page
 * layer, bar and card are what the review shows.
 */
export function ReviewHost() {
  const { reviewing } = useReviewMode();
  const { selectedTool } = useNavigationState();
  const available = useReviewAvailable();
  useEndReviewOutsideAccessibilityTool();
  if (!available || !reviewing || selectedTool !== "checkAccessibility")
    return null;
  return (
    <div hidden data-testid="pdf-editor-review-host">
      <Suspense fallback={null}>
        <PdfTextEditor />
      </Suspense>
    </div>
  );
}
