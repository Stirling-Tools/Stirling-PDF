import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useAuth } from "@app/auth/UseSession";

/**
 * Returns whether the shared (group) signing feature is available.
 * Core implementation reads server config and turns it off for guests.
 */
export function useGroupSigningEnabled(): boolean {
  return useGroupSigningState().enabled;
}

/** Unsettled availability must not replace a previously resolved signing badge. */
export function useGroupSigningState(): { enabled: boolean; settled: boolean } {
  const { config, loading } = useAppConfig();
  // Guests cannot be invited or invite anyone, and the signing endpoints reject them.
  const { isAnonymous } = useAuth();
  return {
    enabled: !isAnonymous && config?.storageGroupSigningEnabled === true,
    settled: !loading,
  };
}
