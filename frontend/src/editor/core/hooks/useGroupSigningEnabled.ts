import { useAppConfig } from "@app/contexts/AppConfigContext";

/**
 * Returns whether the shared (group) signing feature is available.
 * Core implementation reads directly from server config.
 */
export function useGroupSigningEnabled(): boolean {
  return useGroupSigningState().enabled;
}

/** Unsettled availability must not replace a previously resolved signing badge. */
export function useGroupSigningState(): { enabled: boolean; settled: boolean } {
  const { config, loading } = useAppConfig();
  return {
    enabled: config?.storageGroupSigningEnabled === true,
    settled: !loading,
  };
}
