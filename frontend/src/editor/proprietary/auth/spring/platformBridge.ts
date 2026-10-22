/**
 * Platform seam for the Spring auth client.
 *
 * The client itself is platform-agnostic: it never inspects the JWT directly
 * or touches Tauri/desktop storage. Each host wires its own behaviour through
 * this bridge. The web default (used by the portal and the editor's web builds)
 * is a no-op set that mirrors the editor's previous `@app/extensions/*`
 * defaults exactly; the editor's desktop build injects a Tauri-backed bridge.
 */

/**
 * Resolved identity for the current session, as understood by the platform
 * layer that owns the underlying token format. Treated as opaque by the client.
 */
export interface PlatformSessionUser {
  username: string;
  email?: string;
  /** True for anonymous/guest sessions (e.g. Supabase anonymous sign-in). */
  is_anonymous?: boolean;
}

export interface PlatformBridge {
  /** Clear platform-specific cached auth after sign-out (e.g. Tauri store). */
  clearPlatformAuthAfterSignOut(): Promise<void>;
  /** Clear platform-specific cached auth when the login page initialises. */
  clearPlatformAuthOnLoginInit(): Promise<void>;
  /** Whether the active backend is a desktop SaaS gateway (Supabase-managed). */
  isDesktopSaaSAuthMode(): Promise<boolean>;
  /** Whether the active backend exposes /api/v1/auth/logout. */
  shouldCallBackendLogout(): Promise<boolean>;
  /** Resolve the current user from platform storage (desktop only). */
  getPlatformSessionUser(): Promise<PlatformSessionUser | null>;
  /** Refresh the session through the platform layer (desktop only). */
  refreshPlatformSession(): Promise<boolean>;
  /** Persist the token to platform-specific storage (Tauri store). */
  savePlatformToken(token: string): Promise<void>;
  /** Begin an OAuth navigation; return true if the platform handled it. */
  startOAuthNavigation(redirectUrl: string): Promise<boolean>;
}

/**
 * Web defaults - byte-for-byte equivalent to the editor's previous
 * proprietary/extensions defaults so web behaviour is unchanged.
 */
export const defaultPlatformBridge: PlatformBridge = {
  async clearPlatformAuthAfterSignOut() {
    // no-op for web builds
  },
  async clearPlatformAuthOnLoginInit() {
    // no-op for web builds
  },
  async isDesktopSaaSAuthMode() {
    return false;
  },
  async shouldCallBackendLogout() {
    return true;
  },
  async getPlatformSessionUser() {
    return null;
  },
  async refreshPlatformSession() {
    return false;
  },
  async savePlatformToken() {
    // Web mode: token already saved to localStorage in the auth client.
  },
  async startOAuthNavigation() {
    return false;
  },
};
