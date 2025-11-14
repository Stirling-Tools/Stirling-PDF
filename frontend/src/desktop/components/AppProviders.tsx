import { ReactNode } from "react";
import { AppProviders as ProprietaryAppProviders } from "@proprietary/components/AppProviders";
import { DesktopConfigSync } from '@app/components/DesktopConfigSync';
import { DesktopBannerInitializer } from '@app/components/DesktopBannerInitializer';
import { SetupWizard } from '@app/components/SetupWizard';
import { useAppInitialization } from '@app/hooks/useAppInitialization';
import { DESKTOP_DEFAULT_APP_CONFIG } from '@app/config/defaultAppConfig';

/**
 * Desktop application providers
 * Wraps proprietary providers and adds desktop-specific configuration
 * - Enables retry logic for app config (needed for Tauri mode when backend is starting)
 * - Shows setup wizard on first launch
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const { isFirstLaunch, setupComplete } = useAppInitialization();

  // Show setup wizard on first launch
  if (isFirstLaunch && !setupComplete) {
    return (
      <ProprietaryAppProviders
        appConfigRetryOptions={{
          maxRetries: 5,
          initialDelay: 1000,
        }}
        appConfigProviderProps={{
          initialConfig: DESKTOP_DEFAULT_APP_CONFIG,
          bootstrapMode: 'non-blocking',
          autoFetch: false,
        }}
      >
        <SetupWizard
          onComplete={() => {
            // Reload the page to reinitialize with new connection config
            window.location.reload();
          }}
        />
      </ProprietaryAppProviders>
    );
  }

  // Normal app flow
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
