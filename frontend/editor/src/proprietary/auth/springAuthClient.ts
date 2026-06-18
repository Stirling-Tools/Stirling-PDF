/**
 * Spring Auth Client (editor binding)
 *
 * The engine itself now lives in `@shared/auth/spring/springAuthClient` so it
 * can be shared with the portal. This module wires the editor's per-flavor
 * seams into that engine and re-exports it under the original
 * `@app/auth/springAuthClient` path.
 *
 * The `@app/*` imports resolve per build flavor: proprietary/web gets the no-op
 * web defaults, the desktop build gets the Tauri-backed implementations. So the
 * desktop and web auth behaviour is unchanged by the move to shared.
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

// Wire the editor's transport + platform seams into the shared engine. Runs
// once at import; getSpringAuthConfig() is read lazily by the engine, so this
// only needs to happen before the first auth call (AppProviders imports this).
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

export * from "@shared/auth/spring/springAuthClient";
export { default } from "@shared/auth/spring/springAuthClient";
