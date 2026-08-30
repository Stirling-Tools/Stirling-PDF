import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import {
  useNavigationActions,
  useNavigationState,
} from "@app/contexts/NavigationContext";
import { useFileSelection, useAllFiles } from "@app/contexts/FileContext";
import TakeoffWorkbenchView from "@app/tools/takeoff/TakeoffWorkbenchView";
import type { TakeoffWorkbenchData } from "@app/tools/takeoff/TakeoffWorkbenchView";

export const TAKEOFF_WORKBENCH_ID = "custom:takeoff" as const;
const TAKEOFF_WORKBENCH_VIEW_ID = "takeoffWorkbench";

// Registers Take Off's full-screen custom workbench view. This has to be
// mounted once at the app root (same pattern as WatchedFoldersRegistration)
// rather than inside the "takeoff" tool's own registry component: this view
// is registered with hideToolPanel:true, which hides the tool panel the
// instant the workbench switches to it — if the registering component lived
// inside that panel, switching would unmount it and immediately tear down
// the registration it had just made.
export default function TakeoffWorkbenchRegistration() {
  const { t } = useTranslation();
  const {
    registerCustomWorkbenchView,
    unregisterCustomWorkbenchView,
    setCustomWorkbenchViewData,
    clearCustomWorkbenchViewData,
  } = useToolWorkflow();
  const { actions: navigationActions } = useNavigationActions();
  const navigationState = useNavigationState();
  const { selectedFiles } = useFileSelection();
  const { files: allFiles } = useAllFiles();

  // Keep refs to latest cleanup callbacks so the registration effect doesn't
  // re-run (and tear down) when these identities change across renders.
  const unregisterRef = useRef(unregisterCustomWorkbenchView);
  const clearRef = useRef(clearCustomWorkbenchViewData);
  useEffect(() => {
    unregisterRef.current = unregisterCustomWorkbenchView;
  });
  useEffect(() => {
    clearRef.current = clearCustomWorkbenchViewData;
  });

  useEffect(() => {
    registerCustomWorkbenchView({
      id: TAKEOFF_WORKBENCH_VIEW_ID,
      workbenchId: TAKEOFF_WORKBENCH_ID,
      label: t("takeoff.viewLabel", "Take Off"),
      component: TakeoffWorkbenchView,
      hideTopControls: false,
      hideToolPanel: true,
    });
    return () => {
      clearRef.current(TAKEOFF_WORKBENCH_VIEW_ID);
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

  const activeFile = selectedFiles[0] ?? allFiles[0] ?? null;
  useEffect(() => {
    if (!activeFile) return;
    const data: TakeoffWorkbenchData = { file: activeFile };
    setCustomWorkbenchViewData(TAKEOFF_WORKBENCH_VIEW_ID, data);
  }, [activeFile, setCustomWorkbenchViewData]);

  return null;
}
