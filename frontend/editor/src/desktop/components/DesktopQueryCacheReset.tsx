import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { connectionModeService } from "@app/services/connectionModeService";

/**
 * Drops the whole query cache whenever the connection mode changes.
 *
 * Query caches by key. On desktop a key does not pin a backend: operationRouter
 * resolves the same relative path to the local bundled backend, a self-hosted
 * server or the SaaS backend depending on the current mode. So after a mode
 * switch every cached entry may describe a backend the app is no longer talking
 * to — app-config, endpoint availability and capability flags all differ per
 * backend. Web cannot hit this; it talks to one backend for the session.
 *
 * Clearing wholesale rather than invalidating selectively is deliberate: a mode
 * switch already remounts the SaaS provider tree (see the appKey counter in
 * AppProviders), so there is nothing to preserve, and an allowlist of
 * "mode-sensitive" keys would be a standing maintenance trap — every new query
 * would have to remember to join it.
 *
 * Must render inside the QueryClientProvider (i.e. as a child of the core
 * AppProviders), not in the desktop AppProviders body, which sits above it.
 */
export function DesktopQueryCacheReset() {
  const queryClient = useQueryClient();

  useEffect(() => {
    return connectionModeService.subscribeToModeChanges(() => {
      queryClient.clear();
    });
  }, [queryClient]);

  return null;
}
