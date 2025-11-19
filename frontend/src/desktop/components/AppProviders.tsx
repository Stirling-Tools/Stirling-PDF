import { ReactNode, useEffect, useState } from "react";
import { AppProviders as ProprietaryAppProviders } from "@proprietary/components/AppProviders";
import { DesktopConfigSync } from '@app/components/DesktopConfigSync';
import { DesktopBannerInitializer } from '@app/components/DesktopBannerInitializer';
import { SetupWizard } from '@app/components/SetupWizard';
import { useFirstLaunchCheck } from '@app/hooks/useFirstLaunchCheck';
import { useBackendInitializer } from '@app/hooks/useBackendInitializer';
import { DESKTOP_DEFAULT_APP_CONFIG } from '@app/config/defaultAppConfig';
import { connectionModeService } from '@desktop/services/connectionModeService';
import { tauriBackendService } from '@app/services/tauriBackendService';

/**
 * Desktop application providers
 * Wraps proprietary providers and adds desktop-specific configuration
 * - Enables retry logic for app config (needed for Tauri mode when backend is starting)
 * - Shows setup wizard on first launch
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const { isFirstLaunch, setupComplete } = useFirstLaunchCheck();
  const [connectionMode, setConnectionMode] = useState<'offline' | 'server' | null>(null);

  // Load connection mode on mount
  useEffect(() => {
    void connectionModeService.getCurrentMode().then(setConnectionMode);
  }, []);

  // Initialize backend health monitoring for server mode
  useEffect(() => {
    if (setupComplete && !isFirstLaunch && connectionMode === 'server') {
      console.log('[AppProviders] Initializing external backend monitoring for server mode');
      void tauriBackendService.initializeExternalBackend();
    }
  }, [setupComplete, isFirstLaunch, connectionMode]);

  // Only start bundled backend if in SaaS mode (local backend) and setup is complete
  // Self-hosted mode connects to remote server so doesn't need local backend
  const shouldStartBackend = setupComplete && !isFirstLaunch && connectionMode === 'saas';
  useBackendInitializer(shouldStartBackend);

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
          onComplete={async () => {
            console.log('[AppProviders] Setup complete, waiting for backend to be healthy...');

            // Wait for backend to become healthy before reloading
            // This prevents reloading mid-startup which would interrupt the backend
            const maxWaitTime = 60000; // 60 seconds max
            const checkInterval = 1000; // Check every second
            const startTime = Date.now();

            while (Date.now() - startTime < maxWaitTime) {
              if (tauriBackendService.isBackendHealthy()) {
                console.log('[AppProviders] Backend is healthy, reloading page...');
                window.location.reload();
                return;
              }
              console.log('[AppProviders] Waiting for backend... status:', tauriBackendService.getBackendStatus());
              await new Promise(resolve => setTimeout(resolve, checkInterval));
            }

            // If we timeout, reload anyway
            console.warn('[AppProviders] Backend health check timeout, reloading anyway...');
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
