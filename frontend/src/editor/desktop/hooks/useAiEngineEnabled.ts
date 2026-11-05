import { useSaasAppConfig } from "@editor/hooks/useSaasAppConfig";
import { useAppConfig } from "@editor/contexts/AppConfigContext";
import { usePoliciesEnabled } from "@editor/components/policies/usePoliciesEnabled";
import { useSaaSMode } from "@editor/hooks/useSaaSMode";

/** AI availability comes from the connected server's configuration. */
export function useAiEngineEnabled(): boolean {
  const cloudConfig = useSaasAppConfig();
  const { config } = useAppConfig();
  const saas = useSaaSMode();
  const enabled = usePoliciesEnabled();
  return enabled && Boolean((saas ? cloudConfig : config)?.aiEngineEnabled);
}
