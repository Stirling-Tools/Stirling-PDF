import { ReactNode, useEffect, useState } from "react";
import { AppProviders as ProprietaryAppProviders } from "@proprietary/components/AppProviders";
import { DesktopConfigSync } from '@app/components/DesktopConfigSync';
import { DesktopBannerInitializer } from '@app/components/DesktopBannerInitializer';
import { SaveShortcutListener } from '@app/components/SaveShortcutListener';
import { DesktopOnboardingModal } from '@app/components/DesktopOnboardingModal';
import { SignInModal } from '@app/components/SignInModal';
import { useFirstLaunchCheck } from '@app/hooks/useFirstLaunchCheck';
import { useBackendInitializer } from '@app/hooks/useBackendInitializer';
import { DESKTOP_DEFAULT_APP_CONFIG } from '@app/config/defaultAppConfig';
import { connectionModeService } from '@app/services/connectionModeService';
import { tauriBackendService } from '@app/services/tauriBackendService';
import { selfHostedServerMonitor } from '@app/services/selfHostedServerMonitor';
import { authService } from '@app/services/authService';
import { endpointAvailabilityService } from '@app/services/endpointAvailabilityService';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from '@tauri-apps/api/core';
import { SaaSTeamProvider } from '@app/contexts/SaaSTeamContext';
import { SaasBillingProvider } from '@app/contexts/SaasBillingContext';
import { SaaSCheckoutProvider } from '@app/contexts/SaaSCheckoutContext';
import { CreditModalBootstrap } from '@app/components/shared/modals/CreditModalBootstrap';

// Common tool endpoints to preload for faster first-use
const COMMON_TOOL_ENDPOINTS = [
  '/api/v1/misc/compress-pdf',
  '/api/v1/general/merge-pdfs',
  '/api/v1/general/split-pages',
  '/api/v1/convert/pdf/img',
  '/api/v1/convert/img/pdf',
  '/api/v1/general/rotate-pdf',
  '/api/v1/misc/add-watermark',
  '/api/v1/security/add-password',
  '/api/v1/security/remove-password',
  '/api/v1/general/extract-pages',
];

/**
 * Desktop application providers
 * Wraps proprietary providers and adds desktop-specific configuration
 * - Enables retry logic for app config (needed for Tauri mode when backend is starting)
 * - Shows setup wizard on first launch
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const { isFirstLaunch, setupComplete } = useFirstLaunchCheck();
  const [connectionMode, setConnectionMode] = useState<'saas' | 'selfhosted' | 'local' | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  // Load connection mode on mount
  useEffect(() => {
    void connectionModeService.getCurrentMode().then(setConnectionMode);
  }, []);

  useEffect(() => {
    // Wait until connection mode is loaded before checking auth
    if (connectionMode === null) return;

    if (!isFirstLaunch && setupComplete) {
      if (connectionMode === 'local') {
        // Local-only mode: no sign-in required
        setIsAuthenticated(true);
        setAuthChecked(true);
      } else {
        authService.isAuthenticated()
          .then(async (isAuth) => {
            if (!isAuth) {
              // Not authenticated — fall back to local mode instead of showing fullscreen login.
              // Sign-in is handled via DesktopOnboardingModal and LocalModeBanner.
              await connectionModeService.switchToLocal().catch(console.error);
              setConnectionMode('local');
            }
            setIsAuthenticated(true);
          })
          .catch(async () => {
            await connectionModeService.switchToLocal().catch(console.error);
            setConnectionMode('local');
            setIsAuthenticated(true);
          })
          .finally(() => setAuthChecked(true));
      }
    } else if (isFirstLaunch && !setupComplete) {
      // Auto-enter local mode on first launch — skip the setup wizard entirely.
      // The onboarding carousel + sign-in toast will be shown inside the main app.
      // Start the backend explicitly here because shouldMonitorBackend relies on
      // setupComplete (still false from the hook), so useBackendInitializer won't fire.
      connectionModeService.switchToLocal()
        .then(() => tauriBackendService.startBackend())
        .catch(console.error)
        .finally(() => {
          setConnectionMode('local');
          setIsAuthenticated(true);
          setAuthChecked(true);
        });
    }
  }, [isFirstLaunch, setupComplete, connectionMode]);

  // Initialize backend health monitoring for self-hosted mode
  useEffect(() => {
    if (setupComplete && !isFirstLaunch && connectionMode === 'selfhosted') {
      void tauriBackendService.initializeExternalBackend();
      // Also start the self-hosted server monitor so the operation router and UI
      // can detect when the remote server goes offline and fall back to local backend.
      connectionModeService.getServerConfig().then(cfg => {
        if (cfg?.url) {
          selfHostedServerMonitor.start(cfg.url);
        }
      });
    }
    return () => {
      selfHostedServerMonitor.stop();
    };
  }, [setupComplete, isFirstLaunch, connectionMode]);

  // Initialize monitoring for bundled backend (already started in Rust)
  // This sets up port detection and health checks
  const shouldMonitorBackend = setupComplete && !isFirstLaunch && (connectionMode === 'saas' || connectionMode === 'local');
  useBackendInitializer(shouldMonitorBackend);

  // Preload endpoint availability for the local bundled backend.
  // SaaS mode: triggers when the bundled backend reports healthy.
  // Self-hosted mode: triggers when the local bundled backend port is discovered
  //   (so useSelfHostedToolAvailability can use the cache instead of making
  //   individual requests per-tool when the remote server goes offline).
  const shouldPreloadLocalEndpoints =
    (setupComplete && !isFirstLaunch && connectionMode === 'saas') ||
    (setupComplete && !isFirstLaunch && connectionMode === 'local') ||
    (setupComplete && !isFirstLaunch && connectionMode === 'selfhosted');
  useEffect(() => {
    if (!shouldPreloadLocalEndpoints) return;

    const tryPreload = () => {
      const backendUrl = tauriBackendService.getBackendUrl();
      if (!backendUrl) return;
      // tauriBackendService.isOnline now always reflects the local backend.
      // Wait for it to be healthy before preloading in both modes.
      if (!tauriBackendService.isOnline) return;
      console.debug('[AppProviders] Preloading common tool endpoints for local backend');
      void endpointAvailabilityService.preloadEndpoints(COMMON_TOOL_ENDPOINTS, backendUrl);
    };

    const unsubscribe = tauriBackendService.subscribeToStatus(() => tryPreload());
    tryPreload();
    return unsubscribe;
  }, [shouldPreloadLocalEndpoints, connectionMode]);

  useEffect(() => {
    if (!authChecked) {
      return;
    }

    if (!isTauri()) {
      return;
    }

    const currentWindow = getCurrentWindow();
    currentWindow
      .show()
      .then(() => currentWindow.unminimize().catch(() => {}))
      .then(() => currentWindow.setFocus().catch(() => {}))
      .then(() => currentWindow.requestUserAttention(1).catch(() => {}))
      .catch(() => {});
  }, [authChecked]);

  if (!authChecked) {
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
        <div style={{ minHeight: '100vh' }} />
      </ProprietaryAppProviders>
    );
  }

  // Normal app flow
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
      <SaaSTeamProvider>
        <SaasBillingProvider>
          <SaaSCheckoutProvider>
            <DesktopConfigSync />
            <DesktopBannerInitializer />
            <SaveShortcutListener />
            <CreditModalBootstrap />
            {children}
            {/* Desktop onboarding modal: welcome slide → sign-in slide, shown once on first launch */}
            <DesktopOnboardingModal />
            {/* Global sign-in modal, opened via stirling:open-sign-in event */}
            <SignInModal />
          </SaaSCheckoutProvider>
        </SaasBillingProvider>
      </SaaSTeamProvider>
    </ProprietaryAppProviders>
  );
}
