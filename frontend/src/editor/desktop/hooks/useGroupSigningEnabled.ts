import { useAppConfig } from "@editor/contexts/AppConfigContext";
import { useSelfHostedAuth } from "@editor/hooks/useSelfHostedAuth";

/**
 * Desktop override: shared (group) signing requires self-hosted mode AND
 * an authenticated session. Returns false in SaaS/local mode or when logged out.
 */
export function useGroupSigningEnabled(): boolean {
  const { config } = useAppConfig();
  const { isSelfHosted, isAuthenticated } = useSelfHostedAuth();
  return (
    isSelfHosted &&
    isAuthenticated &&
    config?.storageGroupSigningEnabled === true
  );
}
