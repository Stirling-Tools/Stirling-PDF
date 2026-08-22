import { usePortalAccess } from "@app/hooks/usePortalAccess";
import { useAppSwitch } from "@app/components/shared/AppSwitchProvider";
import { type NavFooterAppLink } from "@app/components/shared/navFooter/NavFooter";

/**
 * SaaS: the editor's Supabase context never fetches /me, so processor access
 * comes from the backend via {@link usePortalAccess} — the same signal the
 * processor's own gate uses.
 */
export function useOtherAppSwitch(): NavFooterAppLink | null {
  const portalAccess = usePortalAccess();
  const { switchToApp } = useAppSwitch();
  if (!portalAccess) return null;
  return { app: "processor", onOpen: () => switchToApp("processor") };
}
