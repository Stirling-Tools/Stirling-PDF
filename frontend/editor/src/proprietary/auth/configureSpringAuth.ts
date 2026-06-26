/**
 * Wires the editor's transport + platform seams into the shared Spring auth
 * engine. Import this module for its side effect (it configures the engine on
 * load) before any auth call runs - AppProviders does so via UseSession.
 *
 * The `@app/*` imports resolve per build flavor: proprietary/web gets the no-op
 * web defaults, the desktop build gets the Tauri-backed implementations. So the
 * desktop and web auth behaviour is unchanged by the move to the shared engine.
 */
import type { AxiosInstance } from "axios";
import apiClient from "@app/services/apiClient";
import { BASE_PATH } from "@app/constants/app";
import { configureSpringAuth } from "@shared/auth/config";
import {
  clearPlatformAuthAfterSignOut,
  clearPlatformAuthOnLoginInit,
} from "@app/extensions/authSessionCleanup";
import {
  getPlatformSessionUser,
  isDesktopSaaSAuthMode,
  refreshPlatformSession,
  savePlatformToken,
  shouldCallBackendLogout,
} from "@app/extensions/platformSessionBridge";
import { startOAuthNavigation } from "@app/extensions/oauthNavigation";

configureSpringAuth({
  // The desktop build resolves @app/services/apiClient to a TauriHttpClient,
  // which is API-compatible with axios but not nominally an AxiosInstance -
  // matches the existing `as unknown as AxiosInstance` bridge in
  // desktop/services/apiClient.ts. Harmless no-op for the web (axios) build.
  http: apiClient as unknown as AxiosInstance,
  basePath: BASE_PATH,
  platform: {
    clearPlatformAuthAfterSignOut,
    clearPlatformAuthOnLoginInit,
    isDesktopSaaSAuthMode,
    shouldCallBackendLogout,
    getPlatformSessionUser,
    refreshPlatformSession,
    savePlatformToken,
    startOAuthNavigation,
  },
});
