import { ReactNode, useEffect, useRef, useState } from "react";
import { AppProviders as ProprietaryAppProviders } from "@proprietary/components/AppProviders";
import { DesktopConfigSync } from "@app/components/DesktopConfigSync";
import { DesktopBannerInitializer } from "@app/components/DesktopBannerInitializer";
import { SaveShortcutListener } from "@app/components/SaveShortcutListener";
import { DesktopOnboardingModal } from "@app/components/DesktopOnboardingModal";
import { SignInModal } from "@app/components/SignInModal";
import { OPEN_SIGN_IN_EVENT } from "@app/constants/signInEvents";
import { ToolActionsContext } from "@app/contexts/ToolActionsContext";
import { useFirstLaunchCheck } from "@app/hooks/useFirstLaunchCheck";
import { useBackendInitializer } from "@app/hooks/useBackendInitializer";
import { DESKTOP_DEFAULT_APP_CONFIG } from "@app/config/defaultAppConfig";
import {
  connectionModeService,
  JWT_EXPIRED_PROMPTED_KEY,
} from "@app/services/connectionModeService";
import { STIRLING_SAAS_URL } from "@app/constants/connection";
import { tauriBackendService } from "@app/services/tauriBackendService";
import { selfHostedServerMonitor } from "@app/services/selfHostedServerMonitor";
import { authService } from "@app/services/authService";
import { endpointAvailabilityService } from "@app/services/endpointAvailabilityService";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "@tauri-apps/api/core";
import { SaaSTeamProvider } from "@app/contexts/SaaSTeamContext";
import { SaasBillingProvider } from "@app/contexts/SaasBillingContext";
import { SaaSCheckoutProvider } from "@app/contexts/SaaSCheckoutContext";
import { CreditModalBootstrap } from "@app/components/shared/modals/CreditModalBootstrap";
import UpdateModal from "@core/components/shared/UpdateModal";
import { useDesktopUpdatePopup } from "@app/hooks/useDesktopUpdatePopup";

// Common tool endpoints to preload for faster first-use
const COMMON_TOOL_ENDPOINTS = [
  "/api/v1/misc/compress-pdf",
  "/api/v1/general/merge-pdfs",
  "/api/v1/general/split-pages",
  "/api/v1/convert/pdf/img",
  "/api/v1/convert/img/pdf",
  "/api/v1/general/rotate-pdf",
  "/api/v1/misc/add-watermark",
  "/api/v1/security/add-password",
  "/api/v1/security/remove-password",
  "/api/v1/general/extract-pages",
];

/**
 * Desktop application providers
 * Wraps proprietary providers and adds desktop-specific configuration
 * - Enables retry logic for app config (needed for Tauri mode when backend is starting)
 * - Shows setup wizard on first launch
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const { isFirstLaunch, setupComplete } = useFirstLaunchCheck();
  const updatePopup = useDesktopUpdatePopup();
  const [connectionMode, setConnectionMode] = useState<
    "saas" | "selfhosted" | "local" | null
  >(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [pendingSignIn, setPendingSignIn] = useState(false);
  // Prevent first-launch setup from running twice when connectionMode state update re-triggers the effect
  const firstLaunchInitiated = useRef(false);
  // Key incremented on every connection mode change after initial load — forces SaaS provider
  // tree to remount without a full page reload (avoids Windows WebView2 freeze on window.location.reload()).
  const [appKey, setAppKey] = useState(0);
  const hasLoadedInitialMode = useRef(false);

  // Load connection mode on mount and subscribe to future changes
  useEffect(() => {
    void connectionModeService.getCurrentMode().then((mode) => {
      setConnectionMode(mode);
      hasLoadedInitialMode.current = true;
    });

    const unsub = connectionModeService.subscribeToModeChanges((config) => {
      setConnectionMode(config.mode);
      // Remount the SaaS provider tree when transitioning between saas/local modes so
      // Supabase client state is reset without a full page reload (avoids the Windows
      // WebView2 freeze that window.location.reload() causes during an OAuth flow).
      // Switching TO selfhosted skips the remount — self-hosted mode doesn't use the
      // SaaS providers and remounting mid-wizard resets authChecked, navigating away.
      // Switching FROM selfhosted TO saas DOES trigger a remount (mode !== 'selfhosted')
      // which is intentional — the SaaS provider tree needs fresh state after login.
      if (hasLoadedInitialMode.current && config.mode !== "selfhosted") {
        setAppKey((k) => k + 1);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    // Wait until connection mode is loaded before checking auth
    if (connectionMode === null) return;

    if (!isFirstLaunch && setupComplete) {
      if (connectionMode === "local") {
        // Even in local mode, check for a valid JWT — on Windows, the OAuth callback
        // can complete without switchToSaaS() being called (race condition), leaving
        // LOCAL_MODE_STORAGE_KEY set while the user has a valid session. Upgrade to
        // SaaS mode automatically so credits/billing/team features work correctly.
        authService
          .isAuthenticated()
          .then(async (isAuth) => {
            if (isAuth) {
              await connectionModeService
                .switchToSaaS(STIRLING_SAAS_URL)
                .catch(console.error);
              setConnectionMode("saas");
            }
          })
          .finally(() => setAuthChecked(true));
      } else {
        authService
          .isAuthenticated()
          .then(async (isAuth) => {
            if (!isAuth) {
              const cfg = await connectionModeService
                .getCurrentConfig()
                .catch(() => null);
              if (!cfg?.lock_connection_mode) {
                // JWT expired — fall back to local so local tools still work.
                await connectionModeService
                  .switchToLocal()
                  .catch(console.error);
                setConnectionMode("local");
                // Show sign-in modal once per expiry cycle. If the user dismisses
                // without signing in the flag stays set and we won't prompt again
                // until they successfully sign in (which clears the flag).
                if (!localStorage.getItem(JWT_EXPIRED_PROMPTED_KEY)) {
                  localStorage.setItem(JWT_EXPIRED_PROMPTED_KEY, "true");
                  setPendingSignIn(true);
                }
              }
              // Locked deployments stay in their configured mode — user can sign in
              // via Settings when they're ready.
            }
          })
          .catch(async () => {
            const cfg = await connectionModeService
              .getCurrentConfig()
              .catch(() => null);
            if (!cfg?.lock_connection_mode) {
              await connectionModeService.switchToLocal().catch(console.error);
              setConnectionMode("local");
              if (!localStorage.getItem(JWT_EXPIRED_PROMPTED_KEY)) {
                localStorage.setItem(JWT_EXPIRED_PROMPTED_KEY, "true");
                setPendingSignIn(true);
              }
            }
          })
          .finally(() => setAuthChecked(true));
      }
    } else if (isFirstLaunch && !setupComplete) {
      // Guard against re-running when setConnectionMode triggers this effect.
      if (firstLaunchInitiated.current) return;
      firstLaunchInitiated.current = true;
      connectionModeService
        .getCurrentConfig()
        .then(async (cfg) => {
          if (cfg.lock_connection_mode && cfg.server_config?.url) {
            // Locked provisioned deployment — do NOT switch to local (would clear server_config
            // from the store). Show onboarding normally; the sign-in slide handles locked auth.
            // Still start the local backend so local tools work while the user signs in.
            await tauriBackendService.startBackend().catch(console.error);
            setConnectionMode("selfhosted");
          } else {
            // Normal first launch — auto-enter local mode.
            // The onboarding carousel + sign-in slide will be shown inside the main app.
            await connectionModeService.switchToLocal();
            await tauriBackendService.startBackend();
            setConnectionMode("local");
          }
        })
        .catch(console.error)
        .finally(() => setAuthChecked(true));
    }
  }, [isFirstLaunch, setupComplete, connectionMode]);

  // Initialize backend health monitoring for self-hosted mode
  useEffect(() => {
    if (connectionMode !== "selfhosted") {
      // Stop the monitor whenever we leave selfhosted mode so the dot resets.
      selfHostedServerMonitor.stop();
      return;
    }
    if (setupComplete && !isFirstLaunch) {
      void tauriBackendService.initializeExternalBackend();
      connectionModeService.getServerConfig().then((cfg) => {
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
  const shouldMonitorBackend =
    setupComplete &&
    !isFirstLaunch &&
    (connectionMode === "saas" || connectionMode === "local");
  useBackendInitializer(shouldMonitorBackend);

  // Preload endpoint availability for the local bundled backend.
  // SaaS mode: triggers when the bundled backend reports healthy.
  // Self-hosted mode: triggers when the local bundled backend port is discovered
  //   (so useSelfHostedToolAvailability can use the cache instead of making
  //   individual requests per-tool when the remote server goes offline).
  const shouldPreloadLocalEndpoints =
    (setupComplete && !isFirstLaunch && connectionMode === "saas") ||
    (setupComplete && !isFirstLaunch && connectionMode === "local") ||
    (setupComplete && !isFirstLaunch && connectionMode === "selfhosted");
  useEffect(() => {
    if (!shouldPreloadLocalEndpoints) return;

    const tryPreload = () => {
      const backendUrl = tauriBackendService.getBackendUrl();
      if (!backendUrl) return;
      // tauriBackendService.isOnline now always reflects the local backend.
      // Wait for it to be healthy before preloading in both modes.
      if (!tauriBackendService.isOnline) return;
      console.debug(
        "[AppProviders] Preloading common tool endpoints for local backend",
      );
      void endpointAvailabilityService.preloadEndpoints(
        COMMON_TOOL_ENDPOINTS,
        backendUrl,
      );
    };

    const unsubscribe = tauriBackendService.subscribeToStatus(() =>
      tryPreload(),
    );
    tryPreload();
    return unsubscribe;
  }, [shouldPreloadLocalEndpoints, connectionMode]);

  // Dispatch sign-in modal after authChecked so SignInModal's listener is registered.
  // (Child effects run before parent effects, so this fires after SignInModal mounts.)
  // detail.locked is always false here: setPendingSignIn(true) is only called inside
  // `if (!cfg?.lock_connection_mode)` branches above, so locked deployments never set
  // pendingSignIn and therefore never reach this dispatch.
  useEffect(() => {
    if (!authChecked || !pendingSignIn) return;
    window.dispatchEvent(
      new CustomEvent(OPEN_SIGN_IN_EVENT, { detail: { locked: false } }),
    );
    setPendingSignIn(false);
  }, [authChecked, pendingSignIn]);

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

  // Desktop auto-update popup (shown on startup if update available)
  const { state: popupState, actions: popupActions } = updatePopup;
  const updatePopupModal = popupState.updateSummary && (
    <UpdateModal
      opened={popupState.showModal}
      onClose={popupActions.dismissModal}
      onRemindLater={popupActions.remindLater}
      currentVersion={popupState.currentVersion}
      updateSummary={popupState.updateSummary}
      machineInfo={{
        machineType: navigator.platform?.toLowerCase().includes('mac') ? 'Client-mac'
          : navigator.platform?.toLowerCase().includes('linux') ? 'Client-unix'
          : 'Client-win',
        activeSecurity: false,
        licenseType: 'NORMAL',
      }}
      desktopInstall={popupState.tauriInstallReady ? {
        state: popupState.state,
        progress: popupState.progress,
        errorMessage: popupState.errorMessage,
        canInstall: popupState.canInstall,
        actions: popupActions,
      } : undefined}
    />
  );

  if (!authChecked) {
    return (
      <ProprietaryAppProviders
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
        <div style={{ minHeight: "100vh" }} />
        {updatePopupModal}
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
        bootstrapMode: "non-blocking",
        autoFetch: false,
      }}
    >
      <ToolActionsContext.Provider
        value={{
          onEndpointUnavailableClick: () =>
            window.dispatchEvent(new CustomEvent(OPEN_SIGN_IN_EVENT)),
        }}
      >
        <SaaSTeamProvider key={appKey}>
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
              {/* Desktop auto-update popup */}
              {updatePopupModal}
            </SaaSCheckoutProvider>
          </SaasBillingProvider>
        </SaaSTeamProvider>
      </ToolActionsContext.Provider>
    </ProprietaryAppProviders>
  );
}
