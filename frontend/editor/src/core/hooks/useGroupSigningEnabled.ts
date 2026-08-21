import { useAppConfig } from "@app/contexts/AppConfigContext";

/**
 * Returns whether the shared (group) signing feature is available.
 * Core implementation reads directly from server config.
 */
export function useGroupSigningEnabled(): boolean {
  const { config } = useAppConfig();
  return config?.storageGroupSigningEnabled === true;
}
