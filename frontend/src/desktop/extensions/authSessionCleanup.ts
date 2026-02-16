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
    // Only clear if there's NO token in storage
    // If token exists, user just logged in and we should keep it
    const token = typeof window !== 'undefined' ? localStorage.getItem('stirling_jwt') : null;
    console.log('[AuthCleanup] Login init check - token exists:', !!token, 'length:', token?.length || 0);

    if (!token) {
      console.log('[AuthCleanup] No token found on login init, clearing stale auth data');
      await authService.localClearAuth();
    } else {
      console.log('[AuthCleanup] Token present on login init (length:', token.length, '), skipping cleanup (fresh login)');
    }
  } catch (err) {
    console.warn('[AuthCleanup] Failed to clear desktop auth data on login init', err);
  }
}
