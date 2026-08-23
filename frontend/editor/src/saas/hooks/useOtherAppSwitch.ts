import { useLocation, useNavigate } from "react-router-dom";
import { usePortalAccess } from "@app/hooks/usePortalAccess";
import { useNavigationActions } from "@app/contexts/NavigationContext";
import { PORTAL_BASENAME } from "@app/routes/portalBasename";
import { saveEditorReturnPath } from "@app/services/workbenchSession";
import { type NavFooterAppLink } from "@app/components/shared/navFooter/NavFooter";

/**
 * SaaS: the editor's Supabase context never fetches /me, so processor access
 * comes from the backend via {@link usePortalAccess} — the same signal the
 * processor's own gate uses.
 */
export function useOtherAppSwitch(): NavFooterAppLink | null {
  const portalAccess = usePortalAccess();
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
