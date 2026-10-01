import { useSaasAppConfig } from "@app/hooks/useSaasAppConfig";

/** Desktop classification runs on the connected SaaS deployment. */
export function useAiClassificationEnabled(): boolean {
  const config = useSaasAppConfig();
  return Boolean(config?.aiEngineEnabled && config.aiFeatures?.classify);
}
