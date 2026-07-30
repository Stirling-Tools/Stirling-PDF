import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { saasAppConfigService } from "@app/services/saasAppConfigService";
import { connectionModeService } from "@app/services/connectionModeService";
import type { AppConfig } from "@app/types/appConfig";
import { editorQk } from "@app/queries/keys";

/**
 * The SaaS backend's app-config while in desktop SaaS mode, or null otherwise.
 *
 * General-purpose: read any cloud feature flag from it (e.g.
 * `useSaasAppConfig()?.aiEngineEnabled`, `?.premiumEnabled`). Reloads when the
 * connection mode changes, so switching into/out of SaaS updates the flags
 * (and a server-side flag flip is picked up on the next load).
 */
export function useSaasAppConfig(): AppConfig | null {
  const queryClient = useQueryClient();

  useEffect(() => {
    return connectionModeService.subscribeToModeChanges(() => {
      saasAppConfigService.clearCache();
      void queryClient.invalidateQueries({
        queryKey: editorQk.saasAppConfig(),
      });
    });
  }, [queryClient]);

  const query = useQuery({
    queryKey: editorQk.saasAppConfig(),
    queryFn: () => saasAppConfigService.getConfig(),
    staleTime: 5 * 60 * 1000,
  });

  return query.data ?? null;
}
