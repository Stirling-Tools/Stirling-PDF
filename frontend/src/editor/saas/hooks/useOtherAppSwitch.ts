import { useNavigate } from "react-router-dom";
import { usePortalAccess } from "@editor/hooks/usePortalAccess";
import { useNavigationActions } from "@editor/contexts/NavigationContext";
import { PORTAL_BASENAME } from "@editor/routes/portalBasename";
import { HAS_PORTAL } from "@editor/routes/hasPortal";
import { saveEditorReturnPath } from "@editor/services/workbenchSession";
import { type NavFooterAppLink } from "@editor/components/shared/navFooter/NavFooter";
import { useAuth } from "@editor/auth/UseSession";
import { requestProcessorSignup } from "@editor/services/processorSignup";

/**
 * SaaS: the editor's Supabase context never fetches /me, so processor access
 * comes from the backend via {@link usePortalAccess} — the same signal the
 * processor's own gate uses.
 */
export function useOtherAppSwitch(): NavFooterAppLink | null {
  const portalAccess = usePortalAccess();
  const { isAnonymous } = useAuth();
  const navigate = useNavigate();
  const { actions } = useNavigationActions();
  if (!HAS_PORTAL) return null;
  if (isAnonymous) return { app: "processor", onOpen: requestProcessorSignup };
  if (!portalAccess) return null;
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
