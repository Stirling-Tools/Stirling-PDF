import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useSelfHostedAuth } from "@app/hooks/useSelfHostedAuth";

/**
 * Desktop override: shared (group) signing requires self-hosted mode AND
 * an authenticated session. Returns false in SaaS/local mode or when logged out.
 */
export function useGroupSigningEnabled(): boolean {
  return useGroupSigningState().enabled;
}

/** Waits for desktop mode, authentication and config before confirming availability. */
export function useGroupSigningState(): { enabled: boolean; settled: boolean } {
  const { config, loading: configLoading } = useAppConfig();
  const { isSelfHosted, isAuthenticated, loading } = useSelfHostedAuth();
  return {
    enabled:
      isSelfHosted &&
      isAuthenticated &&
      config?.storageGroupSigningEnabled === true,
    settled: !loading && !configLoading,
  };
}
