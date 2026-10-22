import { useSaasAppConfig } from "@app/hooks/useSaasAppConfig";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { usePoliciesEnabled } from "@app/components/policies/usePoliciesEnabled";
import { useSaaSMode } from "@app/hooks/useSaaSMode";

/** AI availability comes from the connected server's configuration. */
export function useAiEngineEnabled(): boolean {
  const cloudConfig = useSaasAppConfig();
  const { config } = useAppConfig();
  const saas = useSaaSMode();
  const enabled = usePoliciesEnabled();
  return enabled && Boolean((saas ? cloudConfig : config)?.aiEngineEnabled);
}
