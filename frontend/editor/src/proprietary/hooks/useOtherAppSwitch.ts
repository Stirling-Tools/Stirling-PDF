import { useAuth } from "@app/auth/context";
import { useAppSwitch } from "@app/components/shared/AppSwitchProvider";
import { type NavFooterAppLink } from "@app/components/shared/navFooter/NavFooter";

/**
 * Self-hosted: the Spring session carries `portalAccess`, so the switch to the
 * processor is offered exactly when that flag is set.
 */
export function useOtherAppSwitch(): NavFooterAppLink | null {
  const { portalAccess } = useAuth();
  const { switchToApp } = useAppSwitch();
  if (!portalAccess) return null;
  return { app: "processor", onOpen: () => switchToApp("processor") };
}
