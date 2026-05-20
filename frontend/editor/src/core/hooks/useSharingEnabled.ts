import { useAppConfig } from "@app/contexts/AppConfigContext";

export interface SharingEnabledResult {
  sharingEnabled: boolean;
  shareLinksEnabled: boolean;
}

/**
 * Returns whether file-sharing features are available.
 * Core implementation reads directly from server config.
 */
export function useSharingEnabled(): SharingEnabledResult {
  const { config } = useAppConfig();
  return {
    sharingEnabled: config?.storageSharingEnabled === true,
    shareLinksEnabled: config?.storageShareLinksEnabled === true,
  };
}
