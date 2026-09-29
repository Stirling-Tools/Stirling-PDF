import { useAppConfig } from "@app/contexts/AppConfigContext";

export interface AiEngineState {
  enabled: boolean;
  classificationEnabled: boolean;
  loading: boolean;
}

export function useAiEngineEnabled(): AiEngineState {
  const { config, loading } = useAppConfig();
  return {
    enabled: Boolean(config?.aiEngineEnabled),
    classificationEnabled: Boolean(
      config?.aiEngineEnabled && config.aiFeatures?.classify,
    ),
    loading,
  };
}
