import { useCallback, useEffect, useRef } from "react";
import {
  useNavigationActions,
  useNavigationState,
} from "@app/contexts/NavigationContext";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import type { CustomWorkbenchViewRegistration } from "@app/contexts/ToolWorkflowContext";

interface PinOptions {
  workbenchId: CustomWorkbenchViewRegistration["workbenchId"];
  workbenchViewId: string;
  label: string;
  icon: React.ReactNode;
  component: CustomWorkbenchViewRegistration["component"];
}

// Register the custom workbench view and open it when the editor tool is
// selected. Returns a `pin` that brings the canvas back on demand.
export function useWorkbenchPin({
  workbenchId,
  workbenchViewId,
  label,
  icon,
  component,
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
    registerCustomWorkbenchView({
      id: v.workbenchViewId,
      workbenchId: v.workbenchId,
      label: v.label,
      icon: v.icon,
      component: v.component,
    });
    setCustomWorkbenchViewData(v.workbenchViewId, { kind: "pdfTextEditor" });
    setLeftPanelView("toolContent");
    return () => {
      clearCustomWorkbenchViewData(v.workbenchViewId);
      unregisterCustomWorkbenchView(v.workbenchViewId);
    };
  }, [
    registerCustomWorkbenchView,
    unregisterCustomWorkbenchView,
    setCustomWorkbenchViewData,
    clearCustomWorkbenchViewData,
    setLeftPanelView,
  ]);

  const actionsRef = useRef(navigationActions);
  actionsRef.current = navigationActions;

  const pin = useCallback(() => {
    actionsRef.current.setWorkbench(workbenchId);
  }, [workbenchId]);

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
    if (navigationState.workbench === workbenchId) return;
    actionsRef.current.setWorkbench(workbenchId);
  }, [navigationState.selectedTool, navigationState.workbench, workbenchId]);

  return pin;
}
