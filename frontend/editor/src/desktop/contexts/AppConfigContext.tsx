import { useMemo } from "react";
import { useAppConfig as useCoreAppConfig } from "@core/contexts/AppConfigContext";
import { useLocalProcessingOnly } from "@app/hooks/useLocalProcessingOnly";

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
  return useMemo(
    () =>
      !localOnly || !context.config
        ? context
        : {
            ...context,
            config: {
              ...context.config,
              storageEnabled: false,
              storageSharingEnabled: false,
              storageShareLinksEnabled: false,
              storageShareEmailEnabled: false,
              storageGroupSigningEnabled: false,
              aiEngineEnabled: false,
              enableMobileScanner: false,
              enableMobileSignature: false,
            },
          },
    [context, localOnly],
  );
}
