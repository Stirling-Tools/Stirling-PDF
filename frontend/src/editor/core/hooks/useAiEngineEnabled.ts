import { useAppConfig } from "@app/contexts/AppConfigContext";

/**
 * Whether the AI engine is enabled, per the backend's app-config.
 *
 * Web builds read it straight from the app-config (which already comes from the
 * backend the app talks to). Desktop shadows this (desktop/hooks/useAiEngineEnabled)
 * to read it from the SaaS backend in SaaS mode instead of the local bundled one.
 */
export function useAiEngineEnabled(): boolean {
  const { config } = useAppConfig();
  return Boolean(config?.aiEngineEnabled);
}
