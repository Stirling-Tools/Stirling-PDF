import { useNavigate } from "react-router-dom";
import { usePortalAccess } from "@app/hooks/usePortalAccess";
import { PORTAL_BASENAME } from "@app/routes/portalBasename";
import { type NavFooterAppLink } from "@app/components/shared/navFooter/NavFooter";

/**
 * SaaS: the editor's Supabase context never fetches /me, so processor access
 * comes from the backend via {@link usePortalAccess} — the same signal the
 * processor's own gate uses.
 */
export function useOtherAppSwitch(): NavFooterAppLink | null {
  const portalAccess = usePortalAccess();
  const navigate = useNavigate();
  if (!portalAccess) return null;
  return { app: "processor", onOpen: () => navigate(PORTAL_BASENAME) };
}
