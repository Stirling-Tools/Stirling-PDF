import { useCallback, useEffect, useRef } from "react";
import {
  useNavigationActions,
  useNavigationState,
} from "@editor/contexts/NavigationContext";
import { useToolWorkflow } from "@editor/contexts/ToolWorkflowContext";
import type { CustomWorkbenchViewRegistration } from "@editor/contexts/ToolWorkflowContext";

interface PinOptions {
  workbenchId: CustomWorkbenchViewRegistration["workbenchId"];
  workbenchViewId: string;
  label: string;
  icon: React.ReactNode;
  component: CustomWorkbenchViewRegistration["component"];
  /**
   * Edit on the viewer's pages: pin the viewer and register no canvas.
   * Otherwise the canvas is registered full-screen, as phones need.
   */
  inViewer: boolean;
}

// Register the editing canvas (unless editing in the viewer) and open the
// editing surface when the editor tool is selected. Returns a `pin` that brings
// that surface back on demand.
export function useWorkbenchPin({
  workbenchId,
  workbenchViewId,
  label,
  icon,
  component,
  inViewer,
}: PinOptions): () => void {
  const {
    registerCustomWorkbenchView,
    unregisterCustomWorkbenchView,
    setCustomWorkbenchViewData,
    clearCustomWorkbenchViewData,
    setLeftPanelView,
  } = useToolWorkflow();
  const { actions: navigationActions } = useNavigationActions();
  const navigationState = useNavigationState();

  // Stash the per-render values that aren't dependable identities so the effect
  // can read them on mount without re-running on every parent render.
  const viewRef = useRef({
    workbenchId,
    workbenchViewId,
    label,
    icon,
    component,
  });
  viewRef.current = { workbenchId, workbenchViewId, label, icon, component };
  useEffect(() => {
    const v = viewRef.current;
    setLeftPanelView("toolContent");
    if (inViewer) return undefined;
    registerCustomWorkbenchView({
      id: v.workbenchViewId,
      workbenchId: v.workbenchId,
      label: v.label,
      icon: v.icon,
      component: v.component,
      hideToolPanel: true,
      hideTopControls: true,
    });
    setCustomWorkbenchViewData(v.workbenchViewId, { kind: "pdfTextEditor" });
    return () => {
      clearCustomWorkbenchViewData(v.workbenchViewId);
      unregisterCustomWorkbenchView(v.workbenchViewId);
    };
  }, [
    inViewer,
    registerCustomWorkbenchView,
    unregisterCustomWorkbenchView,
    setCustomWorkbenchViewData,
    clearCustomWorkbenchViewData,
    setLeftPanelView,
  ]);

  const actionsRef = useRef(navigationActions);
  actionsRef.current = navigationActions;

  const target = inViewer ? "viewer" : workbenchId;
  const pin = useCallback(() => {
    actionsRef.current.setWorkbench(target);
  }, [target]);

  // Open the canvas once, when the tool is picked. Re-pinning on every
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
    if (navigationState.workbench === target) return;
    actionsRef.current.setWorkbench(target);
  }, [navigationState.selectedTool, navigationState.workbench, target]);

  return pin;
}
