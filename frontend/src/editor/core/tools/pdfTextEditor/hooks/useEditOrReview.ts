import { useCallback, useEffect } from "react";
import { useNavigationState } from "@editor/contexts/NavigationContext";
import { useToolWorkflowActions } from "@editor/contexts/ToolWorkflowContext";
import { reviewMode } from "@editor/tools/pdfTextEditor/store/reviewMode";

/**
 * Switches between editing and the tag-only review, which never run together. Both
 * share one editor store, so switching keeps unsaved changes without asking.
 */
export function useEditOrReview() {
  const { selectedTool } = useNavigationState();
  const { handleToolSelectForced } = useToolWorkflowActions();

  const startReview = useCallback(() => {
    reviewMode.set({ reviewing: true, startAt: null });
    if (selectedTool === "pdfTextEditor")
      handleToolSelectForced("checkAccessibility");
  }, [selectedTool, handleToolSelectForced]);

  const startEditing = useCallback(() => {
    reviewMode.close();
    handleToolSelectForced("pdfTextEditor");
  }, [handleToolSelectForced]);

  return { startReview, startEditing };
}

/**
 * Ends the review whenever the editor tool opens, however it was picked. Mount once,
 * somewhere that lives as long as the workbench.
 */
export function useEndReviewInEditorTool(): void {
  const { selectedTool } = useNavigationState();
  useEffect(() => {
    if (selectedTool === "pdfTextEditor" && reviewMode.get().reviewing)
      reviewMode.close();
  }, [selectedTool]);
}
