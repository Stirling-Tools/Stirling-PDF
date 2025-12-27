/**
 * Helper utilities for clearing cached OAuth redirect/session state
 */

const OAUTH_REDIRECT_COOKIE = 'stirling_redirect_path';

/**
 * Clear any persisted OAuth redirect path/cached state so the app
 * does not automatically resume a previous OAuth session after logout.
 */
export function resetOAuthState(): void {
  try {
    // Remove redirect cookie
    if (typeof document !== 'undefined') {
      document.cookie = `${OAUTH_REDIRECT_COOKIE}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=Lax`;
    }
  } catch (err) {
    console.warn('[OAuthStorage] Failed to clear redirect cookie', err);
  }

  // Remove any related localStorage entries we might have used
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(OAUTH_REDIRECT_COOKIE);
      window.localStorage.removeItem('oauth_redirect_path');
    }
  } catch (err) {
    console.warn('[OAuthStorage] Failed to clear OAuth localStorage', err);
  }
}

export default {
  resetOAuthState,
};
