/**
 * Wires the editor's transport + platform seams into the shared Spring auth
 * engine. Import this module for its side effect (it configures the engine on
 * load) before any auth call runs - AppProviders does so via UseSession.
 *
 * The `@editor/*` imports resolve per build flavor: proprietary/web gets the no-op
 * web defaults, the desktop build gets the Tauri-backed implementations. So the
 * desktop and web auth behaviour is unchanged by the move to the shared engine.
 */
import type { AxiosInstance } from "axios";
import apiClient from "@editor/services/apiClient";
import { BASE_PATH } from "@editor/constants/app";
import { configureSpringAuth } from "@editor/auth/config";
import {
  clearPlatformAuthAfterSignOut,
  clearPlatformAuthOnLoginInit,
} from "@editor/extensions/authSessionCleanup";
import {
  getPlatformSessionUser,
  isDesktopSaaSAuthMode,
  refreshPlatformSession,
  savePlatformToken,
  shouldCallBackendLogout,
} from "@editor/extensions/platformSessionBridge";
import { startOAuthNavigation } from "@editor/extensions/oauthNavigation";

configureSpringAuth({
  // The desktop build resolves @editor/services/apiClient to a TauriHttpClient,
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
