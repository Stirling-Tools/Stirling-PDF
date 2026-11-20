import { useCallback, useEffect } from "react";
import { ACCESSIBILITY_EDITING } from "@editor/constants/featureFlags";
import { useNavigationState } from "@editor/contexts/NavigationContext";
import { useIsMobile } from "@editor/hooks/useIsMobile";
import { useToolWorkflowActions } from "@editor/contexts/ToolWorkflowContext";
import { reviewMode } from "@editor/tools/pdfTextEditor/store/reviewMode";

/**
 * Switches between editing and the review, which runs only in the accessibility tool.
 * Between those two the one editor store carries unsaved changes without asking.
 */
export function useEditOrReview() {
  const { selectedTool } = useNavigationState();
  const { handleToolSelect, handleToolSelectForced } = useToolWorkflowActions();

  const startReview = useCallback(() => {
    if (selectedTool === "checkAccessibility") {
      reviewMode.set({ reviewing: true, startAt: null });
    } else if (selectedTool === "pdfTextEditor") {
      // Set first, so the review takes over the editor in the commit the tool leaves.
      reviewMode.set({ reviewing: true, startAt: null });
      handleToolSelectForced("checkAccessibility");
    } else {
      // The accessibility tool opens the review itself once it shows a file.
      handleToolSelect("checkAccessibility");
    }
  }, [selectedTool, handleToolSelect, handleToolSelectForced]);

  const startEditing = useCallback(() => {
    reviewMode.close();
    handleToolSelectForced("pdfTextEditor");
  }, [handleToolSelectForced]);

  return { startReview, startEditing };
}

/** Whether the review can run here: accessibility editing is on, and the card has room beside the pages. */
export function useReviewAvailable(): boolean {
  return ACCESSIBILITY_EDITING && !useIsMobile();
}

/** Ends the review whenever another tool than the accessibility one is picked. Mount once. */
export function useEndReviewOutsideAccessibilityTool(): void {
  const { selectedTool } = useNavigationState();
  useEffect(() => {
    if (selectedTool !== "checkAccessibility" && reviewMode.get().reviewing)
      reviewMode.close();
  }, [selectedTool]);
}
