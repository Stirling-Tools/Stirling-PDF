import { useMemo } from "react";
import { useAppConfig as useCoreAppConfig } from "@core/contexts/AppConfigContext";
import { useLocalProcessingOnly } from "@app/hooks/useLocalProcessingOnly";
import { DESKTOP_DEFAULT_APP_CONFIG } from "@app/config/defaultAppConfig";

export { AppConfigProvider } from "@core/contexts/AppConfigContext";
export type {
  AppConfig,
  AppConfigProviderProps,
  AppConfigRetryOptions,
  AppConfigBootstrapMode,
} from "@core/contexts/AppConfigContext";

/** The managed device policy takes precedence over server feature flags and cached config. */
export function useAppConfig() {
  const context = useCoreAppConfig();
  const localOnly = useLocalProcessingOnly();
  return useMemo(() => {
    // Core treats a non-fetching seed as the server's answer. The desktop shell
    // seeds DESKTOP_DEFAULT_APP_CONFIG until the bundled backend responds; that
    // object is not the server's answer.
    const configFromServer =
      context.configFromServer && context.config !== DESKTOP_DEFAULT_APP_CONFIG;
    const withSource =
      configFromServer === context.configFromServer
        ? context
        : { ...context, configFromServer };
    if (!localOnly || !withSource.config) return withSource;
    return {
      ...withSource,
      config: {
        ...withSource.config,
        storageEnabled: false,
        storageSharingEnabled: false,
        storageShareLinksEnabled: false,
        storageShareEmailEnabled: false,
        storageGroupSigningEnabled: false,
        aiEngineEnabled: false,
        enableMobileScanner: false,
        enableMobileSignature: false,
      },
    };
  }, [context, localOnly]);
}
