import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@app/auth/context";
import { useNavigationActions } from "@app/contexts/NavigationContext";
import { PORTAL_BASENAME } from "@app/routes/portalBasename";
import { saveEditorReturnPath } from "@app/services/workbenchSession";
import { type NavFooterAppLink } from "@app/components/shared/navFooter/NavFooter";

/**
 * Self-hosted: the Spring session carries `portalAccess`, so the switch to the
 * processor is offered exactly when that flag is set.
 */
export function useOtherAppSwitch(): NavFooterAppLink | null {
  const { portalAccess } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { actions } = useNavigationActions();
  if (!portalAccess) return null;
  return {
    app: "processor",
    onOpen: () =>
      // Through the guard, so unsaved edits get the same warning as any other navigation.
      actions.requestNavigation(() => {
        saveEditorReturnPath(location.pathname + location.search);
        navigate(PORTAL_BASENAME);
      }),
  };
}
