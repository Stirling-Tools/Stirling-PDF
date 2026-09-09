import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import {
  useNavigationActions,
  useNavigationState,
} from "@app/contexts/NavigationContext";
import TakeoffWorkbenchView from "@app/tools/takeoff/TakeoffWorkbenchView";

export const TAKEOFF_WORKBENCH_ID = "custom:takeoff" as const;
const TAKEOFF_WORKBENCH_VIEW_ID = "takeoffWorkbench";

// Registers Take Off's full-screen custom workbench view (the PDF canvas).
// Mounted once at the app root (same pattern as WatchedFoldersRegistration)
// so it isn't torn down by navigation the way a component living inside the
// tool panel would be. The materials list and scale/page/zoom toolbar render
// separately, in the sidebar (see tools/Takeoff.tsx); both share state via
// TakeoffContext rather than through this registration's view data.
export default function TakeoffWorkbenchRegistration() {
  const { t } = useTranslation();
  const { registerCustomWorkbenchView, unregisterCustomWorkbenchView } =
    useToolWorkflow();
  const { actions: navigationActions } = useNavigationActions();
  const navigationState = useNavigationState();

  // Keep a ref to the latest cleanup callback so the registration effect
  // doesn't re-run (and tear down) when its identity changes across renders.
  const unregisterRef = useRef(unregisterCustomWorkbenchView);
  useEffect(() => {
    unregisterRef.current = unregisterCustomWorkbenchView;
  });

  useEffect(() => {
    registerCustomWorkbenchView({
      id: TAKEOFF_WORKBENCH_VIEW_ID,
      workbenchId: TAKEOFF_WORKBENCH_ID,
      label: t("takeoff.viewLabel", "Take Off"),
      component: TakeoffWorkbenchView,
      hideTopControls: false,
      hideToolPanel: false,
    });
    return () => {
      unregisterRef.current(TAKEOFF_WORKBENCH_VIEW_ID);
    };
  }, [registerCustomWorkbenchView, t]);

  const hasAutoOpenedRef = useRef(false);
  useEffect(() => {
    if (navigationState.selectedTool !== "takeoff") {
      hasAutoOpenedRef.current = false;
      return;
    }
    if (hasAutoOpenedRef.current) return;
    hasAutoOpenedRef.current = true;
    navigationActions.setWorkbench(TAKEOFF_WORKBENCH_ID);
  }, [navigationState.selectedTool, navigationActions]);

  return null;
}
