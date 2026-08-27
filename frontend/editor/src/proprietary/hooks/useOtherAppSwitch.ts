import { useNavigate } from "react-router-dom";
import { useAuth } from "@app/auth/context";
import { PORTAL_BASENAME } from "@app/routes/portalBasename";
import { useProcessorEnabled } from "@app/hooks/useProcessorEnabled";
import { type NavFooterAppLink } from "@app/components/shared/navFooter/NavFooter";

/**
 * Self-hosted: the Spring session carries `portalAccess`, so the switch to the
 * processor is offered exactly when that flag is set - and never on an
 * editor-only server, where there is no processor to switch to.
 */
export function useOtherAppSwitch(): NavFooterAppLink | null {
  const { portalAccess } = useAuth();
  const processorEnabled = useProcessorEnabled();
  const navigate = useNavigate();
  if (!portalAccess || !processorEnabled) return null;
  return { app: "processor", onOpen: () => navigate(PORTAL_BASENAME) };
}
