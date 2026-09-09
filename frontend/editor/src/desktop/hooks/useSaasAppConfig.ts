import { useEffect, useState } from "react";
import { saasAppConfigService } from "@app/services/saasAppConfigService";
import { connectionModeService } from "@app/services/connectionModeService";
import type { AppConfig } from "@app/types/appConfig";

/**
 * The SaaS backend's app-config while in desktop SaaS mode, or null otherwise.
 *
 * General-purpose: read any cloud feature flag from it (e.g.
 * `useSaasAppConfig()?.aiEngineEnabled`, `?.premiumEnabled`). Reloads when the
 * connection mode changes, so switching into/out of SaaS updates the flags
 * (and a server-side flag flip is picked up on the next load).
 */
export function useSaasAppConfig(): AppConfig | null {
  const [config, setConfig] = useState<AppConfig | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      void saasAppConfigService.getConfig().then((c) => {
        if (alive) setConfig(c);
      });
    };
    load();
    const unsubscribe = connectionModeService.subscribeToModeChanges(() => {
      saasAppConfigService.clearCache();
      load();
    });
    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, []);

  return config;
}
