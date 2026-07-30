import { useAppConfig } from "@app/contexts/AppConfigContext";

/**
 * Whether the DocParse layer is enabled, per the backend's app-config.
 * Gates the DocParse tools' visibility; flavors may shadow this hook.
 */
export function useDocparseEnabled(): boolean {
  const { config } = useAppConfig();
  return Boolean(config?.docparseEnabled);
}
