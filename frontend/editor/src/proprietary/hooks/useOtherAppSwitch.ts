import { useNavigate } from "react-router-dom";
import { useAuth } from "@app/auth/context";
import { PROCESSOR_BASENAME } from "@app/routes/processorBasename";
import { type NavFooterAppLink } from "@app/components/shared/navFooter/NavFooter";

/**
 * Self-hosted: the Spring session carries `processorAccess`, so the switch to the
 * processor is offered exactly when that flag is set.
 */
export function useOtherAppSwitch(): NavFooterAppLink | null {
  const { processorAccess } = useAuth();
  const navigate = useNavigate();
  if (!processorAccess) return null;
  return { app: "processor", onOpen: () => navigate(PROCESSOR_BASENAME) };
}
