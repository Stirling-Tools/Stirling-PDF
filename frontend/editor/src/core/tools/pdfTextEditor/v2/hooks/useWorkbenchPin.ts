import { useEffect, useRef } from "react";
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

/**
 * Register the custom workbench view and keep it pinned while the editor
 * tool is selected. Other contexts (FileContext, ViewerContext) routinely
 * push the workbench back to "viewer" on file events; the effect here
 * undoes that whenever the user is still inside the editor.
 */
export function useWorkbenchPin({
  workbenchId,
  workbenchViewId,
  label,
  icon,
  component,
}: PinOptions): void {
  const {
    registerCustomWorkbenchView,
    unregisterCustomWorkbenchView,
    setCustomWorkbenchViewData,
    clearCustomWorkbenchViewData,
    setLeftPanelView,
  } = useToolWorkflow();
  const { actions: navigationActions } = useNavigationActions();
  const navigationState = useNavigationState();

  // Stash the per-render values that aren't dependable identities (icon
  // is a fresh JSX node every render) so the effect can read them on
  // mount without re-running on every parent render.
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
    setCustomWorkbenchViewData(v.workbenchViewId, { kind: "v2" });
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
  useEffect(() => {
    if (navigationState.selectedTool !== "pdfTextEditor") return;
    if (navigationState.workbench === workbenchId) return;
    actionsRef.current.setWorkbench(workbenchId);
  }, [navigationState.selectedTool, navigationState.workbench, workbenchId]);
}
