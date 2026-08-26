import { useNavigate } from "react-router-dom";
import { useAuth } from "@app/auth/context";
import { PORTAL_BASENAME } from "@app/routes/portalBasename";
import { type NavFooterAppLink } from "@app/components/shared/navFooter/NavFooter";

/**
 * Self-hosted: the Spring session carries `portalAccess`, so the switch to the
 * processor is offered exactly when that flag is set.
 */
export function useOtherAppSwitch(): NavFooterAppLink | null {
  const { portalAccess } = useAuth();
  const navigate = useNavigate();
  if (!portalAccess) return null;
  return { app: "processor", onOpen: () => navigate(PORTAL_BASENAME) };
}
