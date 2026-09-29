import { useAuth } from "@app/auth/UseSession";
import { useAppConfig } from "@app/contexts/AppConfigContext";

/**
 * Whether the signed-in account administers this instance.
 *
 * <p>Same two sources the editor's own gates use, session first: app config answers for a build
 * with login off, where everyone is effectively the administrator.
 */
export function usePortalAdmin(): boolean {
  const authState = useAuth();
  const { config } = useAppConfig();
  return authState.isAdmin ?? config?.isAdmin ?? false;
}
