import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useSaasAppConfig } from "@app/hooks/useSaasAppConfig";
import { useSelfHostedAuth } from "@app/hooks/useSelfHostedAuth";

/** Desktop: the engine runs on the connected server, so the flag comes from that server's own
 *  app-config. Local mode reaches neither and reports the engine off. */
export function useAiEngineEnabled(): boolean {
  const saasConfig = useSaasAppConfig();
  const { config } = useAppConfig();
  const { isSelfHosted, isAuthenticated } = useSelfHostedAuth();

  if (isSelfHosted && isAuthenticated) {
    return config?.aiEngineEnabled === true;
  }
  return Boolean(saasConfig?.aiEngineEnabled);
}
