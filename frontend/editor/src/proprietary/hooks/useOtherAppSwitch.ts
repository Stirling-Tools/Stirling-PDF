import { useAuth } from "@app/auth/context";
import { useAppSwitch } from "@app/components/shared/AppSwitchProvider";
import { useNavigationActions } from "@app/contexts/NavigationContext";
import { saveEditorReturnPath } from "@app/services/workbenchSession";
import { type NavFooterAppLink } from "@app/components/shared/navFooter/NavFooter";

/**
 * Self-hosted: the Spring session carries `portalAccess`, so the switch to the
 * processor is offered exactly when that flag is set.
 */
export function useOtherAppSwitch(): NavFooterAppLink | null {
  const { portalAccess } = useAuth();
  const { switchToApp } = useAppSwitch();
  const { actions } = useNavigationActions();
  if (!portalAccess) return null;
  return {
    app: "processor",
    onOpen: () =>
      // Through the guard, so unsaved edits get the same warning as any other navigation.
      actions.requestNavigation(() => {
        saveEditorReturnPath();
        switchToApp("processor");
      }),
  };
}
