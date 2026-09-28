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
  takeOverScreen: boolean;
}

// Register the custom workbench view and open it when the editor tool is
// selected. Returns a `pin` that brings the canvas back on demand.
export function useWorkbenchPin({
  workbenchId,
  workbenchViewId,
  label,
  icon,
  component,
  takeOverScreen,
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
  const register = useCallback(
    (fullScreen: boolean) => {
      const v = viewRef.current;
      registerCustomWorkbenchView({
        id: v.workbenchViewId,
        workbenchId: v.workbenchId,
        label: v.label,
        icon: v.icon,
        component: v.component,
        hideToolPanel: fullScreen,
        hideTopControls: fullScreen,
      });
    },
    [registerCustomWorkbenchView],
  );
  const takeOverRef = useRef(takeOverScreen);
  takeOverRef.current = takeOverScreen;
  useEffect(() => {
    const v = viewRef.current;
    register(takeOverRef.current);
    setCustomWorkbenchViewData(v.workbenchViewId, { kind: "pdfTextEditor" });
    setLeftPanelView("toolContent");
    return () => {
      clearCustomWorkbenchViewData(v.workbenchViewId);
      unregisterCustomWorkbenchView(v.workbenchViewId);
    };
  }, [
    register,
    unregisterCustomWorkbenchView,
    setCustomWorkbenchViewData,
    clearCustomWorkbenchViewData,
    setLeftPanelView,
  ]);

  const registeredTakeOverRef = useRef(takeOverScreen);
  useEffect(() => {
    if (registeredTakeOverRef.current === takeOverScreen) return;
    registeredTakeOverRef.current = takeOverScreen;
    register(takeOverScreen);
  }, [register, takeOverScreen]);

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
