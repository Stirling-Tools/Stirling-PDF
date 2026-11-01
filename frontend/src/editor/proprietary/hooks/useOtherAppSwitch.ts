import { useNavigate } from "react-router-dom";
import { useAuth } from "@editor/auth/context";
import { useNavigationActions } from "@editor/contexts/NavigationContext";
import { PORTAL_BASENAME } from "@editor/routes/portalBasename";
import { HAS_PORTAL } from "@editor/routes/hasPortal";
import { saveEditorReturnPath } from "@editor/services/workbenchSession";
import { type NavFooterAppLink } from "@editor/components/shared/navFooter/NavFooter";

/**
 * Self-hosted: the Spring session carries `portalAccess`, so the switch to the
 * processor is offered exactly when that flag is set.
 */
export function useOtherAppSwitch(): NavFooterAppLink | null {
  const { portalAccess } = useAuth();
  const navigate = useNavigate();
  const { actions } = useNavigationActions();
  if (!HAS_PORTAL || !portalAccess) return null;
  return {
    app: "processor",
    onOpen: () =>
      // Through the guard, so unsaved edits get the same warning as any other navigation.
      actions.requestNavigation(() => {
        saveEditorReturnPath();
        navigate(PORTAL_BASENAME);
      }),
  };
}
