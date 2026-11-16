import { useAppConfig } from "@editor/contexts/AppConfigContext";

/**
 * Whether this portal can reach the Pipeline store. The store lives on the SaaS backend, so a
 * self-hosted instance that can link an account reaches it over that same link even before the
 * backend advertises the flag itself.
 */
export function useStoreAvailable(): boolean {
  const { config } = useAppConfig();
  return (
    config?.storeAvailable === true || config?.accountLinkAvailable === true
  );
}
