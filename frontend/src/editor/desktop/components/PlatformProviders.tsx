import { ReactNode } from "react";
import { PlatformProviders as ProprietaryPlatformProviders } from "@editor-proprietary/components/PlatformProviders";
import { DESKTOP_DEFAULT_APP_CONFIG } from "@editor/config/defaultAppConfig";

/**
 * Retries the app config because the bundled backend may still be starting,
 * and renders on the bundled defaults until DesktopConfigSync fetches it.
 */
export function PlatformProviders({ children }: { children: ReactNode }) {
  return (
    <ProprietaryPlatformProviders
      appConfigRetryOptions={{
        maxRetries: 5,
        initialDelay: 1000,
      }}
      appConfigProviderProps={{
        initialConfig: DESKTOP_DEFAULT_APP_CONFIG,
        bootstrapMode: "non-blocking",
        autoFetch: false,
      }}
    >
      {children}
    </ProprietaryPlatformProviders>
  );
}
