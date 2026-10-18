import { useAppConfig } from "@app/contexts/AppConfigContext";

/** Whether server-side document classification can run on this deployment. */
export function useAiClassificationEnabled(): boolean {
  const { config } = useAppConfig();
  return Boolean(config?.aiEngineEnabled && config.aiFeatures?.classify);
}
