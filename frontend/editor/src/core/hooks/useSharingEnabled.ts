import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useAuth } from "@app/auth/UseSession";

export interface SharingEnabledResult {
  sharingEnabled: boolean;
  shareLinksEnabled: boolean;
}

/**
 * Returns whether file-sharing features are available.
 * Core implementation reads server config and turns it off for guests.
 */
export function useSharingEnabled(): SharingEnabledResult {
  const { config } = useAppConfig();
  // Sharing needs server storage, which guests do not have.
  const { isAnonymous } = useAuth();
  return {
    sharingEnabled: !isAnonymous && config?.storageSharingEnabled === true,
    shareLinksEnabled:
      !isAnonymous && config?.storageShareLinksEnabled === true,
  };
}
