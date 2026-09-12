import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useSaasAppConfig } from "@app/hooks/useSaasAppConfig";
import { useSelfHostedAuth } from "@app/hooks/useSelfHostedAuth";

/**
 * Desktop: the AI engine runs on the connected server, never on the bundled backend.
 *
 * The flag comes from whichever server is connected, so that server keeps the on/off
 * switch and flipping it needs no desktop release. Local mode reaches neither config
 * and so reports the engine off.
 */
export function useAiEngineEnabled(): boolean {
  const saasConfig = useSaasAppConfig();
  const { config } = useAppConfig();
  const { isSelfHosted, isAuthenticated } = useSelfHostedAuth();

  if (isSelfHosted && isAuthenticated) {
    return config?.aiEngineEnabled === true;
  }
  return Boolean(saasConfig?.aiEngineEnabled);
}
