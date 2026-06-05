import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import PolicyIcon from "@mui/icons-material/Policy";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { PoliciesPanel } from "@app/components/policies/PoliciesPanel";

export const POLICY_VIEW_ID = "policies";
export const POLICY_WORKBENCH_ID = "custom:policies" as const;

/**
 * Registers the Policies workbench view. Mirrors the Watch Folders registration
 * pattern: refs hold the latest cleanup callbacks so the registration effect
 * only depends on the stable `registerCustomWorkbenchView` (prevents teardown
 * on unrelated navigation re-renders). Sets non-null initial data so the view
 * is selectable from the workbench bar with no prior interaction.
 */
export default function PoliciesRegistration() {
  const { t } = useTranslation();
  const {
    registerCustomWorkbenchView,
    unregisterCustomWorkbenchView,
    clearCustomWorkbenchViewData,
    setCustomWorkbenchViewData,
  } = useToolWorkflow();

  const unregisterRef = useRef(unregisterCustomWorkbenchView);
  const clearRef = useRef(clearCustomWorkbenchViewData);
  const setDataRef = useRef(setCustomWorkbenchViewData);
  useEffect(() => {
    unregisterRef.current = unregisterCustomWorkbenchView;
  });
  useEffect(() => {
    clearRef.current = clearCustomWorkbenchViewData;
  });
  useEffect(() => {
    setDataRef.current = setCustomWorkbenchViewData;
  });

  useEffect(() => {
    registerCustomWorkbenchView({
      id: POLICY_VIEW_ID,
      workbenchId: POLICY_WORKBENCH_ID,
      label: t("policies.sidebarTitle", "Policies"),
      icon: <PolicyIcon sx={{ fontSize: "medium" }} />,
      component: PoliciesPanel,
      hideTopControls: false,
      hideToolPanel: true,
    });
    setDataRef.current(POLICY_VIEW_ID, {});
    return () => {
      clearRef.current(POLICY_VIEW_ID);
      unregisterRef.current(POLICY_VIEW_ID);
    };
  }, [registerCustomWorkbenchView, t]);

  return null;
}
