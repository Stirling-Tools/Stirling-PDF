import { Suspense, lazy } from "react";
import { ACCESSIBILITY_EDITING } from "@editor/constants/featureFlags";
import { useNavigationState } from "@editor/contexts/NavigationContext";
import { useReviewMode } from "@editor/tools/pdfTextEditor/store/reviewMode";
import { useEndReviewInEditorTool } from "@editor/tools/pdfTextEditor/hooks/useEditOrReview";

const PdfTextEditor = lazy(
  () => import("@editor/tools/pdfTextEditor/PdfTextEditor"),
);

/**
 * Keeps the editor running hidden while a review runs under another tool. Never
 * mounted with the editor tool: both would register as the viewer's page tool.
 */
export function ReviewHost() {
  const { reviewing } = useReviewMode();
  const { selectedTool } = useNavigationState();
  useEndReviewInEditorTool();
  if (!ACCESSIBILITY_EDITING || !reviewing || selectedTool === "pdfTextEditor")
    return null;
  return (
    <div hidden data-testid="pdf-editor-review-host">
      <Suspense fallback={null}>
        <PdfTextEditor />
      </Suspense>
    </div>
  );
}
