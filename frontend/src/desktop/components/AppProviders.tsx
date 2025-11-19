import { ReactNode } from "react";
import { AppProviders as ProprietaryAppProviders } from "@proprietary/components/AppProviders";
import { DesktopConfigSync } from '@app/components/DesktopConfigSync';
import { DesktopBannerInitializer } from '@app/components/DesktopBannerInitializer';
import { DESKTOP_DEFAULT_APP_CONFIG } from '@app/config/defaultAppConfig';

/**
 * Desktop application providers
 * Wraps proprietary providers and adds desktop-specific configuration
 * - Enables retry logic for app config (needed for Tauri mode when backend is starting)
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ProprietaryAppProviders
      appConfigRetryOptions={{
        maxRetries: 5,
        initialDelay: 1000, // 1 second, with exponential backoff
      }}
      appConfigProviderProps={{
        initialConfig: DESKTOP_DEFAULT_APP_CONFIG,
        bootstrapMode: 'non-blocking',
        autoFetch: false,
      }}
    >
      <DesktopConfigSync />
      <DesktopBannerInitializer />
      {children}
    </ProprietaryAppProviders>
  );
}
