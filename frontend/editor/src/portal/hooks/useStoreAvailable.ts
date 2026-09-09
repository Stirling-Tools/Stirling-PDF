import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@portal/api/http";
import { qk } from "@portal/queries/keys";
import type { AppConfig } from "@app/types/appConfig";

/**
 * Whether this portal can reach the Pipeline store. The store lives on the SaaS backend, so a
 * self-hosted instance that can link an account reaches it over that same link even before the
 * backend advertises the flag itself. Shares the app-config query with useConnectGate.
 */
export function useStoreAvailable(): boolean {
  const query = useQuery({
    queryKey: qk.appConfig(),
    queryFn: () => apiClient.local.json<AppConfig>("/api/v1/config/app-config"),
  });
  return (
    query.data?.storeAvailable === true ||
    query.data?.accountLinkAvailable === true
  );
}
