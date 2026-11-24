import { Suspense, lazy } from "react";
import { useNavigationState } from "@editor/contexts/NavigationContext";
import { useReviewMode } from "@editor/tools/pdfTextEditor/store/reviewMode";
import { useEndReviewOutsideAccessibilityTool } from "@editor/tools/pdfTextEditor/hooks/useEditOrReview";

// Lazy because the Workbench imports this file: an eager editor import would put
// the editor's store in the app's first bundle.
const PdfTextEditor = lazy(
  () => import("@editor/tools/pdfTextEditor/PdfTextEditor"),
);
const CloseReviewPrompt = lazy(() =>
  import("@editor/tools/pdfTextEditor/components/review/CloseReviewPrompt").then(
    (m) => ({ default: m.CloseReviewPrompt }),
  ),
);

/**
 * Runs the editor hidden while a review is open in the accessibility tool; its page
 * layer, bar and card are what the review shows.
 */
export function ReviewHost() {
  const { reviewing } = useReviewMode();
  const { selectedTool } = useNavigationState();
  useEndReviewOutsideAccessibilityTool();
  // Availability gates entering a review only: unmounting an open one (the
  // window narrowing) would drop its unsaved tags without asking.
  if (!reviewing || selectedTool !== "checkAccessibility") return null;
  return (
    <>
      <div hidden data-testid="pdf-editor-review-host">
        <Suspense fallback={null}>
          <PdfTextEditor />
        </Suspense>
      </div>
      {/* Here rather than in the viewer's bar: Hide tagging tool is pressed from the
          tool panel, whichever workbench is showing. */}
      <Suspense fallback={null}>
        <CloseReviewPrompt />
      </Suspense>
    </>
  );
}
