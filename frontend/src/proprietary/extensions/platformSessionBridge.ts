export interface PlatformSessionUser {
  username: string;
  email?: string;
}

/**
 * Proprietary/web default: no desktop SaaS auth bridge.
 */
export async function isDesktopSaaSAuthMode(): Promise<boolean> {
  return false;
}

/**
 * Proprietary/web default: no platform user store.
 */
export async function getPlatformSessionUser(): Promise<PlatformSessionUser | null> {
  return null;
}

/**
 * Proprietary/web default: no platform refresh path.
 */
export async function refreshPlatformSession(): Promise<boolean> {
  return false;
}

/**
 * Proprietary/web default: no platform-specific token storage (uses localStorage only).
 */
export async function savePlatformToken(_token: string): Promise<void> {
  // Web mode: token already saved to localStorage in springAuthClient
  // No additional platform storage needed
}
