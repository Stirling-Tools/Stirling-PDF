import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useSelfHostedAuth } from "@app/hooks/useSelfHostedAuth";
import type { SharingEnabledResult } from "@core/hooks/useSharingEnabled";

/**
 * Desktop override: file-sharing features require self-hosted mode AND an
 * authenticated session. Returns false for both in SaaS/local mode or when
 * logged out.
 */
export function useSharingEnabled(): SharingEnabledResult {
  const { config } = useAppConfig();
  const { isSelfHosted, isAuthenticated } = useSelfHostedAuth();
  const allowed = isSelfHosted && isAuthenticated;
  return {
    sharingEnabled: allowed && config?.storageSharingEnabled === true,
    shareLinksEnabled: allowed && config?.storageShareLinksEnabled === true,
  };
}
