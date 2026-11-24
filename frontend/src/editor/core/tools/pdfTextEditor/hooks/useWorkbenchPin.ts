import { useCallback, useEffect, useRef } from "react";
import {
  useNavigationActions,
  useNavigationState,
} from "@editor/contexts/NavigationContext";
import { useToolWorkflow } from "@editor/contexts/ToolWorkflowContext";

// Editing happens on the viewer's pages, so opening the editor tool opens the
// viewer. Returns a `pin` that brings the viewer back on demand.
export function useWorkbenchPin(): () => void {
  const { setLeftPanelView } = useToolWorkflow();
  const { actions: navigationActions } = useNavigationActions();
  const navigationState = useNavigationState();

  // Only for the editor tool itself: a review running under another tool
  // must leave that tool's panel as the user has it.
  const openedAsToolRef = useRef(
    navigationState.selectedTool === "pdfTextEditor",
  );
  useEffect(() => {
    if (openedAsToolRef.current) setLeftPanelView("toolContent");
  }, [setLeftPanelView]);

  const actionsRef = useRef(navigationActions);
  actionsRef.current = navigationActions;

  const pin = useCallback(() => {
    actionsRef.current.setWorkbench("viewer");
  }, []);

  // Open the viewer once, when the tool is picked. Re-pinning on every
  // workbench change would bounce the user straight back here the moment they
  // switch to Active Files to choose a different file.
  const pinnedRef = useRef(false);
  useEffect(() => {
    if (navigationState.selectedTool !== "pdfTextEditor") {
      pinnedRef.current = false;
      return;
    }
    if (pinnedRef.current) return;
    pinnedRef.current = true;
    if (navigationState.workbench === "viewer") return;
    actionsRef.current.setWorkbench("viewer");
  }, [navigationState.selectedTool, navigationState.workbench]);

  return pin;
}
