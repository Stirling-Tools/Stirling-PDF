import { authService } from '@app/services/authService';

/**
 * Desktop-specific auth cleanup hooks.
 */
export async function clearPlatformAuthAfterSignOut(): Promise<void> {
  try {
    await authService.localClearAuth();
  } catch (err) {
    console.warn('[AuthCleanup] Failed to clear desktop auth data after sign out', err);
  }
}

export async function clearPlatformAuthOnLoginInit(): Promise<void> {
  try {
    await authService.localClearAuth();
  } catch (err) {
    console.warn('[AuthCleanup] Failed to clear desktop auth data on login init', err);
  }
}
